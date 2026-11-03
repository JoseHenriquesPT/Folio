import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../db/notes";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import type { CleanupResult } from "./useNoteAttachments";
import {
  useNoteEditorActions,
  type NoteEditorActionsOptions,
} from "./useNoteEditorActions";

const toast = { push: vi.fn() };
const confirm = vi.fn(async () => true);

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    owner_id: "user-1",
    notebook_id: "notebook-1",
    title: "Shopping",
    body_html: "<p>milk</p>",
    body_text: "milk",
    search: null,
    pinned: false,
    archived: false,
    deleted_at: null,
    version: 1,
    last_edited_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function setup(overrides: Partial<NoteEditorActionsOptions> = {}) {
  const db = createFakeDb();
  const setNote = vi.fn();
  const setNotebookId = vi.fn();
  const notebookIdRef = { current: "notebook-1" };
  const removeAllAttachments = vi.fn(
    async (): Promise<CleanupResult> => ({ ok: true, removed: 0 })
  );
  const onChanged = vi.fn();
  const onBack = vi.fn();

  const view = renderHook(
    (props: Partial<NoteEditorActionsOptions>) =>
      useNoteEditorActions({
        client: db.client,
        note: note(),
        canManage: true,
        setNote,
        setNotebookId,
        notebookIdRef,
        removeAllAttachments,
        confirm,
        toast,
        onChanged,
        onBack,
        ...props,
      }),
    { initialProps: overrides }
  );

  return {
    db,
    setNote,
    setNotebookId,
    notebookIdRef,
    removeAllAttachments,
    onChanged,
    onBack,
    view,
  };
}

function confirmResolved(answer: boolean) {
  confirm.mockResolvedValue(answer);
}

beforeEach(() => {
  toast.push.mockClear();
  confirm.mockReset();
  confirmResolved(true);
});

describe("useNoteEditorActions", () => {
  it("pins a note, folds the saved row back in, and refreshes the list", async () => {
    const { db, setNote, onChanged, view } = setup();
    const query = db.queue("notes", { data: note({ pinned: true }) });

    await view.result.current.togglePin();

    expect(methodCalls(query, "update")).toEqual([[{ pinned: true }]]);
    expect(methodCalls(query, "eq")).toEqual([["id", "note-1"]]);
    expect(setNote).toHaveBeenCalledExactlyOnceWith(note({ pinned: true }));
    expect(onChanged).toHaveBeenCalledOnce();
    expect(view.result.current.busy).toBe(false);
  });

  it("unpins a pinned note", async () => {
    const { db, view } = setup();
    view.rerender({ note: note({ pinned: true }) });
    const query = db.queue("notes", { data: note({ pinned: false }) });

    await view.result.current.togglePin();

    expect(methodCalls(query, "update")).toEqual([[{ pinned: false }]]);
  });

  it("archives with a toast, and unarchives with the restore wording", async () => {
    const { db, onChanged, view } = setup();
    const query = db.queue("notes", { data: note({ archived: true }) });

    await view.result.current.toggleArchive();

    expect(methodCalls(query, "update")).toEqual([[{ archived: true }]]);
    expect(toast.push).toHaveBeenCalledWith("Note archived.", "success");
    expect(onChanged).toHaveBeenCalledOnce();

    view.rerender({ note: note({ archived: true }) });
    const second = db.queue("notes", { data: note({ archived: false }) });
    await view.result.current.toggleArchive();

    expect(methodCalls(second, "update")).toEqual([[{ archived: false }]]);
    expect(toast.push).toHaveBeenCalledWith(
      "Note restored from archive.",
      "success"
    );
  });

  it("moves the note to another notebook", async () => {
    const { db, setNote, setNotebookId, notebookIdRef, onChanged, view } =
      setup();
    const query = db.queue("notes", { data: note({ notebook_id: "notebook-2" }) });

    await view.result.current.changeNotebook("notebook-2");

    expect(setNotebookId).toHaveBeenCalledExactlyOnceWith("notebook-2");
    expect(notebookIdRef.current).toBe("notebook-2");
    expect(methodCalls(query, "update")).toEqual([
      [{ notebook_id: "notebook-2" }],
    ]);
    expect(setNote).toHaveBeenCalledExactlyOnceWith(
      note({ notebook_id: "notebook-2" })
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("files a note into Unfiled", async () => {
    const { db, view } = setup();
    const query = db.queue("notes", { data: note({ notebook_id: null }) });

    await view.result.current.changeNotebook(null);

    expect(methodCalls(query, "update")).toEqual([[{ notebook_id: null }]]);
  });

  it("keeps the chosen notebook even when the move fails", async () => {
    const { db, setNotebookId, notebookIdRef, onChanged, view } = setup();
    db.queue("notes", {
      data: null,
      error: { message: "permission denied" },
    });

    await view.result.current.changeNotebook("notebook-2");

    expect(setNotebookId).toHaveBeenCalledExactlyOnceWith("notebook-2");
    expect(notebookIdRef.current).toBe("notebook-2");
    expect(toast.push).toHaveBeenCalledWith("permission denied", "error");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("asks before trashing and stops when declined", async () => {
    confirmResolved(false);
    const { db, onChanged, onBack, view } = setup();
    const query = db.queue("notes", { data: note() });

    await view.result.current.moveToTrash();

    expect(confirm).toHaveBeenCalledExactlyOnceWith({
      title: "Move to trash",
      message: "Move this note to the trash?",
      confirmLabel: "Move to trash",
      tone: "danger",
    });
    expect(methodCalls(query, "update")).toEqual([]);
    expect(toast.push).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("trashes a note once confirmed", async () => {
    const { db, onChanged, onBack, view } = setup();
    const query = db.queue("notes", { data: note() });

    await view.result.current.moveToTrash();

    const patch = methodCalls(query, "update")[0]?.[0] as {
      deleted_at: string;
    };
    expect(typeof patch.deleted_at).toBe("string");
    expect(toast.push).toHaveBeenCalledWith("Note moved to trash.", "success");
    expect(onChanged).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("restores a note from the trash", async () => {
    const { db, onChanged, onBack, view } = setup();
    const query = db.queue("notes", { data: note({ deleted_at: null }) });

    await view.result.current.restoreFromTrash();

    expect(methodCalls(query, "update")).toEqual([[{ deleted_at: null }]]);
    expect(toast.push).toHaveBeenCalledWith("Note restored.", "success");
    expect(onChanged).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("never deletes a note without confirmation", async () => {
    confirmResolved(false);
    const { db, removeAllAttachments, onChanged, onBack, view } = setup();
    const notes = db.queue("notes", { data: null });

    await view.result.current.permanentlyDelete();

    expect(confirm).toHaveBeenCalledExactlyOnceWith({
      title: "Delete permanently",
      message:
        "Permanently delete this note? The database record cannot be recovered.",
      confirmLabel: "Delete permanently",
      tone: "danger",
    });
    expect(removeAllAttachments).not.toHaveBeenCalled();
    expect(notes.calls.some((call) => call.method === "delete")).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("keeps the note when its files cannot be cleaned up first", async () => {
    const removeAllAttachments = vi.fn(
      async (): Promise<CleanupResult> => ({
        ok: false,
        error: new Error("storage down"),
      })
    );
    const { db, onChanged, onBack, view } = setup({ removeAllAttachments });
    const notes = db.queue("notes", { data: null });

    await view.result.current.permanentlyDelete();

    expect(removeAllAttachments).toHaveBeenCalledOnce();
    expect(notes.calls.some((call) => call.method === "delete")).toBe(false);
    expect(toast.push).toHaveBeenCalledWith(
      "Could not remove this note's files. Nothing was deleted — try again.",
      "error"
    );
    expect(onChanged).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("clears the note's files before deleting it permanently", async () => {
    const { db, removeAllAttachments, onChanged, onBack, view } = setup();
    const notes = db.queue("notes", { data: null });

    await view.result.current.permanentlyDelete();

    expect(removeAllAttachments).toHaveBeenCalledOnce();
    expect(notes.calls.some((call) => call.method === "delete")).toBe(true);
    expect(toast.push).toHaveBeenCalledWith(
      "Note deleted permanently.",
      "success"
    );
    expect(onChanged).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("reports failures as an error toast", async () => {
    const { db, onChanged, view } = setup();
    db.queue("notes", { data: null, error: { message: "network down" } });

    await view.result.current.togglePin();

    expect(toast.push).toHaveBeenCalledWith("network down", "error");
    expect(onChanged).not.toHaveBeenCalled();
    expect(view.result.current.busy).toBe(false);
  });

  it("does nothing without permission", async () => {
    const { db, onChanged, onBack, view } = setup({ canManage: false });
    const query = db.queue("notes", { data: note() });

    await view.result.current.togglePin();
    await view.result.current.toggleArchive();
    await view.result.current.moveToTrash();
    await view.result.current.restoreFromTrash();
    await view.result.current.permanentlyDelete();

    expect(query.calls).toHaveLength(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(view.result.current.busy).toBe(false);
  });

  it("does nothing without an open note", async () => {
    const { db, onChanged, onBack, view } = setup({ note: null });
    const query = db.queue("notes", { data: note() });

    await view.result.current.togglePin();
    await view.result.current.moveToTrash();

    expect(query.calls).toHaveLength(0);
    expect(onChanged).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("is busy while an action runs and free again afterwards", async () => {
    const { db, removeAllAttachments, onBack, view } = setup();
    let release: (result: CleanupResult) => void = () => {};
    removeAllAttachments.mockImplementation(
      () =>
        new Promise<CleanupResult>((resolve) => {
          release = resolve;
        })
    );
    db.queue("notes", { data: null });

    const done = view.result.current.permanentlyDelete();
    await vi.waitFor(() => expect(view.result.current.busy).toBe(true));

    await act(async () => {
      release({ ok: true, removed: 1 });
      await done;
    });

    expect(view.result.current.busy).toBe(false);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
