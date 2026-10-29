import { useCallback } from "react";
import { removeAttachmentsForNote } from "../db/attachments";
import {
  deleteNotePermanently,
  moveNoteToNotebook,
  restoreNote,
  setNoteArchived,
  setNotePinned,
  trashNote,
  type NoteSummary,
} from "../db/notes";
import type { DbClient } from "../db/supabase";
import { attachTag, detachTag } from "../db/tags";
import { DELETE_CONFIRM, TRASH_CONFIRM, type ConfirmOptions } from "../lib/confirm";
import type { DropPlan } from "../lib/dragNote";
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
  /** Called after a change that affects the note list. */
  onChanged: () => void;
  /** Called after a change that affects the sidebar's tag counts. */
  onTagsChanged: () => void;
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
  onTagsChanged,
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
      // The caller shows a picker for this one; applying the choice is
      // applyDrop's job.
      if (action === "move") return;

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

  /** Carries out the plan a card's drag produced over a sidebar row. */
  const applyDrop = useCallback(
    async (note: NoteSummary, plan: DropPlan) => {
      try {
        switch (plan.action) {
          case "none":
          case "noop":
            return;
          case "move":
            await moveNoteToNotebook(client, note.id, plan.notebookId);
            toast.push(`Moved to ${plan.label}.`, "success");
            onChanged();
            break;
          case "tag-add":
            await attachTag(client, note.id, plan.tagId);
            toast.push(`Tagged ${plan.label}.`, "success");
            onTagsChanged();
            break;
          case "tag-remove":
            await detachTag(client, note.id, plan.tagId);
            toast.push(`Removed ${plan.label}.`, "success");
            onTagsChanged();
            break;
        }
      } catch (error) {
        toast.push(toMessage(error), "error");
      }
    },
    [client, onChanged, onTagsChanged, toast]
  );

  return { run, applyDrop };
}
