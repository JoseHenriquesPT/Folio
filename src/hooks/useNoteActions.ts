import { useCallback } from "react";
import { removeAttachmentsForNote } from "../db/attachments";
import {
  deleteNotePermanently,
  restoreNote,
  setNoteArchived,
  setNotePinned,
  trashNote,
  type NoteSummary,
} from "../db/notes";
import type { DbClient } from "../db/supabase";
import { DELETE_CONFIRM, TRASH_CONFIRM, type ConfirmOptions } from "../lib/confirm";
import { toMessage } from "../lib/errors";
import type { NoteMenuAction } from "../lib/noteMenu";

type ToastLike = {
  push: (message: string, tone: "success" | "error" | "info") => void;
};

type ConfirmLike = (options: ConfirmOptions) => Promise<boolean>;

export interface NoteActionsOptions {
  client: DbClient;
  toast: ToastLike;
  confirm: ConfirmLike;
  /** Called after any mutation so the caller can refresh the list. */
  onChanged: () => void;
  onOpen: (noteId: string) => void;
  onShare: (note: NoteSummary) => void;
}

/**
 * Runs the actions a note card offers. It mirrors the editor's behaviour —
 * the same confirmations, the same toasts — without owning any view state.
 */
export function useNoteActions({
  client,
  toast,
  confirm,
  onChanged,
  onOpen,
  onShare,
}: NoteActionsOptions) {
  const run = useCallback(
    async (note: NoteSummary, action: NoteMenuAction) => {
      if (action === "open") {
        onOpen(note.id);
        return;
      }
      if (action === "share") {
        onShare(note);
        return;
      }

      try {
        switch (action) {
          case "pin":
            await setNotePinned(client, note.id, true);
            toast.push("Note pinned.", "success");
            break;
          case "unpin":
            await setNotePinned(client, note.id, false);
            toast.push("Note unpinned.", "success");
            break;
          case "archive":
            await setNoteArchived(client, note.id, true);
            toast.push("Note archived.", "success");
            break;
          case "unarchive":
            await setNoteArchived(client, note.id, false);
            toast.push("Note unarchived.", "success");
            break;
          case "trash": {
            if (!(await confirm(TRASH_CONFIRM))) return;
            await trashNote(client, note.id);
            toast.push("Note moved to trash.", "success");
            break;
          }
          case "restore":
            await restoreNote(client, note.id);
            toast.push("Note restored.", "success");
            break;
          case "delete": {
            if (!(await confirm(DELETE_CONFIRM))) return;
            await removeAttachmentsForNote(client, note.id);
            await deleteNotePermanently(client, note.id);
            toast.push("Note deleted permanently.", "success");
            break;
          }
        }

        onChanged();
      } catch (error) {
        toast.push(toMessage(error), "error");
      }
    },
    [client, confirm, onChanged, onOpen, onShare, toast]
  );

  return { run };
}
