import type { NotebookRow } from "../db/database.types";

export type NotebookNode = NotebookRow & {
  children: NotebookNode[];
};

function compareNotebooks(a: NotebookRow, b: NotebookRow): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.name.localeCompare(b.name);
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
