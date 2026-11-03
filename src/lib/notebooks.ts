import type { NotebookRow } from "../db/database.types";

export type NotebookNode = NotebookRow & {
  children: NotebookNode[];
};

function compareNotebooks(a: NotebookRow, b: NotebookRow): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.name.localeCompare(b.name);
}

function sortedSiblings(
  notebooks: NotebookRow[],
  parentId: string | null
): NotebookRow[] {
  return notebooks
    .filter((notebook) => (notebook.parent_id ?? null) === parentId)
    .sort(compareNotebooks);
}

export function buildNotebookTree(notebooks: NotebookRow[]): NotebookNode[] {
  const nodes = new Map<string, NotebookNode>(
    notebooks.map((notebook) => [notebook.id, { ...notebook, children: [] }])
  );
  const roots: NotebookNode[] = [];

  for (const notebook of notebooks) {
    const node = nodes.get(notebook.id);
    if (!node) continue;

    const parent =
      notebook.parent_id && notebook.parent_id !== notebook.id
        ? nodes.get(notebook.parent_id)
        : undefined;

    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  for (const node of nodes.values()) {
    node.children.sort(compareNotebooks);
  }

  // Defensive: a corrupt cycle would otherwise make notes unreachable.
  const visited = new Set<string>();
  const visit = (node: NotebookNode) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    for (const child of node.children) visit(child);
  };
  for (const root of roots) visit(root);

  for (const node of nodes.values()) {
    if (visited.has(node.id)) continue;

    if (node.parent_id) {
      const parent = nodes.get(node.parent_id);
      if (parent) {
        parent.children = parent.children.filter(
          (child) => child.id !== node.id
        );
      }
    }
    node.children = node.children.filter((child) => child.id !== node.id);
    roots.push(node);
    visit(node);
  }

  return roots.sort(compareNotebooks);
}

export function flattenNotebookTree(
  nodes: NotebookNode[],
  depth = 0
): { node: NotebookNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenNotebookTree(node.children, depth + 1),
  ]);
}

export interface VisibleNotebookRow {
  node: NotebookNode;
  depth: number;
  hasChildren: boolean;
}

/** Flattening that stops below a collapsed notebook, keeping the notebook row. */
export function visibleNotebookRows(
  nodes: NotebookNode[],
  collapsed: ReadonlySet<string>,
  depth = 0
): VisibleNotebookRow[] {
  return nodes.flatMap((node) => [
    { node, depth, hasChildren: node.children.length > 0 },
    ...(collapsed.has(node.id)
      ? []
      : visibleNotebookRows(node.children, collapsed, depth + 1)),
  ]);
}

export type NotebookDropZone = "before" | "inside" | "after";

/** Top and bottom quarters reorder; the middle nests. */
export function notebookDropZone(
  clientY: number,
  top: number,
  height: number
): NotebookDropZone {
  if (height <= 0) return "inside";
  const ratio = (clientY - top) / height;
  if (ratio <= 0.25) return "before";
  if (ratio >= 0.75) return "after";
  return "inside";
}

export interface NotebookDropPlan {
  parentId: string | null;
  /** The complete, newly ordered sibling list under `parentId`. */
  orderedIds: string[];
  label: string;
}

/**
 * What dropping `draggedId` on `targetId` would do. Before/after reorder
 * beside the target in its parent; inside nests the dragged notebook at the
 * end of the target's children. A null target means the top level. Dropping a
 * notebook on itself or into its own subtree is refused.
 */
export function planNotebookDrop(
  notebooks: NotebookRow[],
  draggedId: string,
  targetId: string | null,
  zone: NotebookDropZone
): NotebookDropPlan | null {
  const dragged = notebooks.find((notebook) => notebook.id === draggedId);
  if (!dragged) return null;

  if (!targetId) {
    if (zone !== "inside") return null;
    const siblings = sortedSiblings(notebooks, null)
      .filter((notebook) => notebook.id !== draggedId)
      .map((notebook) => notebook.id);
    return {
      parentId: null,
      orderedIds: [...siblings, draggedId],
      label: "to the top level",
    };
  }

  const target = notebooks.find((notebook) => notebook.id === targetId);
  if (!target || target.id === draggedId) return null;
  if (notebookDescendantIds(notebooks, draggedId).has(target.id)) return null;

  const parentId = zone === "inside" ? target.id : target.parent_id;
  const siblings = sortedSiblings(notebooks, parentId)
    .filter((notebook) => notebook.id !== draggedId)
    .map((notebook) => notebook.id);

  if (zone === "inside") {
    return {
      parentId,
      orderedIds: [...siblings, draggedId],
      label: `inside ${target.name}`,
    };
  }

  const index = siblings.indexOf(target.id);
  if (index < 0) return null;
  const ordered = [...siblings];
  ordered.splice(zone === "before" ? index : index + 1, 0, draggedId);

  return {
    parentId,
    orderedIds: ordered,
    label: `${zone} ${target.name}`,
  };
}

/** True when the plan would leave that parent exactly as it already is. */
export function notebookOrderMatches(
  notebooks: NotebookRow[],
  plan: NotebookDropPlan
): boolean {
  const current = sortedSiblings(notebooks, plan.parentId).map(
    (notebook) => notebook.id
  );
  return (
    current.length === plan.orderedIds.length &&
    current.every((id, index) => id === plan.orderedIds[index])
  );
}

export function notebookDescendantIds(
  notebooks: NotebookRow[],
  notebookId: string
): Set<string> {
  const ids = new Set<string>();
  if (!notebooks.some((notebook) => notebook.id === notebookId)) return ids;

  ids.add(notebookId);
  let added = true;
  while (added) {
    added = false;
    for (const notebook of notebooks) {
      if (
        notebook.parent_id &&
        ids.has(notebook.parent_id) &&
        !ids.has(notebook.id)
      ) {
        ids.add(notebook.id);
        added = true;
      }
    }
  }
  return ids;
}

export function notebookBreadcrumb(
  notebooks: NotebookRow[],
  notebookId: string
): NotebookRow[] {
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const path: NotebookRow[] = [];
  const seen = new Set<string>();

  let current = byId.get(notebookId);
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return path;
}
