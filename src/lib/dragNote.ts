export type DropKind = "notebook" | "tag";

export interface DropTarget {
  kind: DropKind;
  /** Notebook id, or "unfiled" for the Unfiled row; a tag id for tags. */
  id: string;
  label: string;
}

export interface DropSubject {
  notebook_id: string | null;
  tag_ids: string[];
  deleted_at: string | null;
}

export type DropPlan =
  | { action: "none" }
  | { action: "noop"; label: string }
  | { action: "move"; notebookId: string | null; label: string }
  | { action: "tag-add"; tagId: string; label: string }
  | { action: "tag-remove"; tagId: string; label: string };

/** The Unfiled row's stand-in id, since it has no notebook. */
export const UNFILED_ID = "unfiled";

/**
 * Reads the element the pointer is over — usually a child of the row, since
 * the pointer hits the label, count, or icon — and works back to the row
 * carrying the drop attributes.
 */
export function dropTargetFrom(element: Element | null): DropTarget | null {
  const row = element?.closest<HTMLElement>("[data-drop-kind]");
  if (!row) return null;

  const kind = row.dataset.dropKind;
  const id = row.dataset.dropId;
  const label = row.dataset.dropLabel;
  if (!id || !label) return null;
  if (kind !== "notebook" && kind !== "tag") return null;

  return { kind, id, label };
}

/**
 * What releasing a note over `target` would do. Dropping where it already
 * sits, and moving anything that is in the trash, are both no-ops.
 */
export function planDrop(
  note: DropSubject,
  target: DropTarget | null
): DropPlan {
  if (!target || note.deleted_at) return { action: "none" };

  if (target.kind === "notebook") {
    const notebookId = target.id === UNFILED_ID ? null : target.id;
    if ((note.notebook_id ?? null) === notebookId) {
      return { action: "noop", label: target.label };
    }
    return { action: "move", notebookId, label: target.label };
  }

  return note.tag_ids.includes(target.id)
    ? { action: "tag-remove", tagId: target.id, label: target.label }
    : { action: "tag-add", tagId: target.id, label: target.label };
}
