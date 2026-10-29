export type NoteMenuAction =
  | "open"
  | "pin"
  | "unpin"
  | "archive"
  | "unarchive"
  | "move"
  | "share"
  | "trash"
  | "restore"
  | "delete";

export interface NoteMenuItem {
  id: NoteMenuAction;
  label: string;
  tone?: "danger";
}

/** The fields a note must expose for the menu to be built. */
export interface NoteMenuSubject {
  owner_id: string;
  pinned: boolean;
  archived: boolean;
  deleted_at: string | null;
}

/**
 * Actions available on a note card. Sharing is owner-controlled and the
 * database refuses edits from anyone else, so a note that was shared with the
 * viewer gets no menu at all.
 */
export function noteMenuItems(
  note: NoteMenuSubject,
  currentUserId: string
): NoteMenuItem[] {
  if (note.owner_id !== currentUserId) return [];

  if (note.deleted_at) {
    return [
      { id: "open", label: "Open" },
      { id: "restore", label: "Restore" },
      { id: "delete", label: "Delete permanently", tone: "danger" },
    ];
  }

  return [
    { id: "open", label: "Open" },
    note.pinned
      ? { id: "unpin", label: "Unpin" }
      : { id: "pin", label: "Pin" },
    note.archived
      ? { id: "unarchive", label: "Unarchive" }
      : { id: "archive", label: "Archive" },
    { id: "move", label: "Move to notebook…" },
    { id: "share", label: "Share" },
    { id: "trash", label: "Move to trash", tone: "danger" },
  ];
}
