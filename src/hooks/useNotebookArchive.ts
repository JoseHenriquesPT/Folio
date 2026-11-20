import { useCallback } from "react";
import type { NotebookRow } from "../db/database.types";
import { setNotebookArchived } from "../db/notebooks";
import type { DbClient } from "../db/supabase";
import type { ConfirmOptions } from "../lib/confirm";
import { toMessage } from "../lib/errors";
import { formatNoteCount } from "../lib/format";

type ToastLike = {
  push: (message: string, tone: "success" | "error" | "info") => void;
};

type ConfirmLike = (options: ConfirmOptions) => Promise<boolean>;

export interface NotebookArchiveOptions {
  client: DbClient;
  toast: ToastLike;
  confirm: ConfirmLike;
  /** Called after a change that affects the note list and notebook counts. */
  onChanged: () => void | Promise<void>;
}

/**
 * The bulk form of archiving: one confirmed action archives or unarchives
 * every active note in a notebook subtree. Returns the number of notes that
 * actually changed, or null when the user declined or the database refused.
 */
export function useNotebookArchive({
  client,
  toast,
  confirm,
  onChanged,
}: NotebookArchiveOptions) {
  return useCallback(
    async (
      notebook: Pick<NotebookRow, "id" | "name">,
      archived: boolean
    ): Promise<number | null> => {
      const accepted = await confirm(
        archived
          ? {
              title: "Archive notebook",
              message: `Archive every active note in “${notebook.name}” and its sub-notebooks? They move to Archived, where you can restore them.`,
              confirmLabel: "Archive notes",
            }
          : {
              title: "Unarchive notebook",
              message: `Bring every archived note in “${notebook.name}” and its sub-notebooks back to the main list?`,
              confirmLabel: "Unarchive notes",
            }
      );
      if (!accepted) return null;

      try {
        const count = await setNotebookArchived(client, notebook.id, archived);
        if (count === 0) {
          toast.push(
            archived
              ? `No active notes to archive in “${notebook.name}”.`
              : `No archived notes to restore in “${notebook.name}”.`,
            "info"
          );
          return 0;
        }

        toast.push(
          archived
            ? `Archived ${formatNoteCount(count)} in “${notebook.name}”.`
            : `Unarchived ${formatNoteCount(count)} in “${notebook.name}”.`,
          "success"
        );
        await onChanged();
        return count;
      } catch (error) {
        toast.push(toMessage(error), "error");
        return null;
      }
    },
    [client, confirm, onChanged, toast]
  );
}
