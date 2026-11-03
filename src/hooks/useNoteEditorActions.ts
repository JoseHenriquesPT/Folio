import { useCallback, useState } from "react";
import {
  deleteNotePermanently,
  moveNoteToNotebook,
  restoreNote,
  setNoteArchived,
  setNotePinned,
  trashNote,
  type Note,
} from "../db/notes";
import type { DbClient } from "../db/supabase";
import {
  DELETE_CONFIRM,
  TRASH_CONFIRM,
  type ConfirmOptions,
} from "../lib/confirm";
import { toMessage } from "../lib/errors";
import type { CleanupResult } from "./useNoteAttachments";

type ToastLike = {
  push: (message: string, tone: "success" | "error" | "info") => void;
};

type ConfirmLike = (options: ConfirmOptions) => Promise<boolean>;

export interface NoteEditorActionsOptions {
  client: DbClient;
  note: Note | null;
  canManage: boolean;
  setNote: (note: Note) => void;
  setNotebookId: (notebookId: string | null) => void;
  notebookIdRef: { current: string | null };
  removeAllAttachments: () => Promise<CleanupResult>;
  confirm: ConfirmLike;
  toast: ToastLike;
  onChanged: () => void;
  onBack: () => void;
}

/**
 * The editor's non-content actions — pin, archive, notebook, trash, restore,
 * permanent delete. Owning `busy` here keeps the editor free of the repeated
 * set-busy/try/catch shell without changing any confirmation copy.
 */
export function useNoteEditorActions({
  client,
  note,
  canManage,
  setNote,
  setNotebookId,
  notebookIdRef,
  removeAllAttachments,
  confirm,
  toast,
  onChanged,
  onBack,
}: NoteEditorActionsOptions) {
  const [busy, setBusy] = useState(false);

  const togglePin = useCallback(async () => {
    if (!note || !canManage) return;
    setBusy(true);
    try {
      const updated = await setNotePinned(client, note.id, !note.pinned);
      setNote(updated);
      onChanged();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }, [canManage, client, note, onChanged, setNote, toast]);

  const toggleArchive = useCallback(async () => {
    if (!note || !canManage) return;
    setBusy(true);
    try {
      const updated = await setNoteArchived(client, note.id, !note.archived);
      setNote(updated);
      onChanged();
      toast.push(
        updated.archived
          ? "Note archived."
          : "Note restored from archive.",
        "success"
      );
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }, [canManage, client, note, onChanged, setNote, toast]);

  const changeNotebook = useCallback(
    async (nextId: string | null) => {
      setNotebookId(nextId);
      notebookIdRef.current = nextId;
      if (!note || !canManage) return;

      try {
        const updated = await moveNoteToNotebook(client, note.id, nextId);
        setNote(updated);
        onChanged();
      } catch (nextError) {
        toast.push(toMessage(nextError), "error");
      }
    },
    [
      canManage,
      client,
      note,
      notebookIdRef,
      onChanged,
      setNote,
      setNotebookId,
      toast,
    ]
  );

  const moveToTrash = useCallback(async () => {
    if (!note || !canManage) return;
    const accepted = await confirm(TRASH_CONFIRM);
    if (!accepted) return;

    setBusy(true);
    try {
      await trashNote(client, note.id);
      onChanged();
      toast.push("Note moved to trash.", "success");
      onBack();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }, [canManage, client, confirm, note, onBack, onChanged, toast]);

  const restoreFromTrash = useCallback(async () => {
    if (!note || !canManage) return;
    setBusy(true);
    try {
      await restoreNote(client, note.id);
      onChanged();
      toast.push("Note restored.", "success");
      onBack();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }, [canManage, client, note, onBack, onChanged, toast]);

  const permanentlyDelete = useCallback(async () => {
    if (!note || !canManage) return;
    const accepted = await confirm(DELETE_CONFIRM);
    if (!accepted) return;

    setBusy(true);
    try {
      const cleanup = await removeAllAttachments();
      if (!cleanup.ok) {
        toast.push(
          "Could not remove this note's files. Nothing was deleted — try again.",
          "error"
        );
        return;
      }

      await deleteNotePermanently(client, note.id);
      onChanged();
      toast.push("Note deleted permanently.", "success");
      onBack();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }, [
    canManage,
    client,
    confirm,
    note,
    onBack,
    onChanged,
    removeAllAttachments,
    toast,
  ]);

  return {
    busy,
    togglePin,
    toggleArchive,
    changeNotebook,
    moveToTrash,
    restoreFromTrash,
    permanentlyDelete,
  };
}
