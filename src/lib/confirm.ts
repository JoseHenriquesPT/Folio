export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
}

/** The two destructive confirmations for a note, shared by the editor and the card menu. */
export const TRASH_CONFIRM: ConfirmOptions = {
  title: "Move to trash",
  message: "Move this note to the trash?",
  confirmLabel: "Move to trash",
  tone: "danger",
};

export const DELETE_CONFIRM: ConfirmOptions = {
  title: "Delete permanently",
  message:
    "Permanently delete this note? The database record cannot be recovered.",
  confirmLabel: "Delete permanently",
  tone: "danger",
};
