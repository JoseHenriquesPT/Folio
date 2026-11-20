import type { ActionMenuItem } from "./actionMenu";

export type NotebookMenuAction = "open" | "archive" | "unarchive" | "manage";

export type NotebookMenuItem = ActionMenuItem<NotebookMenuAction>;

/** What a notebook must expose for its sidebar menu to be built. */
export interface NotebookMenuSubject {
  owner_id: string;
}

/**
 * Sidebar actions for a notebook. Archive and unarchive are bulk note actions:
 * the notebook itself is never changed. Shared notebooks stay owner-controlled,
 * so their rows get no menu.
 */
export function notebookMenuItems(
  notebook: NotebookMenuSubject,
  currentUserId: string
): NotebookMenuItem[] {
  if (notebook.owner_id !== currentUserId) return [];

  return [
    { id: "open", label: "Open" },
    { id: "archive", label: "Archive all notes" },
    { id: "unarchive", label: "Unarchive all notes" },
    { id: "manage", label: "Manage notebooks…" },
  ];
}
