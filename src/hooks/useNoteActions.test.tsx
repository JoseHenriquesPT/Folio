import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATTACHMENT_BUCKET } from "../db/attachments";
import type { NoteSummary } from "../db/notes";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import { useNoteActions, type NoteActionsOptions } from "./useNoteActions";

const toast = { push: vi.fn() };
const confirm = vi.fn(async () => true);

function summary(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "note-1",
    owner_id: "user-1",
    notebook_id: null,
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
    tags: [],
    tag_ids: [],
    attachment_count: 0,
    share_count: 0,
    share_recipients: [],
    owner_display_name: "Owner",
    my_share_permission: null,
    ...overrides,
  };
}

function setup(overrides: Partial<NoteActionsOptions> = {}) {
  const db = createFakeDb();
  const onChanged = vi.fn();
  const onTagsChanged = vi.fn();
  const onOpen = vi.fn();
  const onShare = vi.fn();

  const view = renderHook(() =>
    useNoteActions({
      client: db.client,
      toast,
      confirm,
      onChanged,
      onTagsChanged,
      onOpen,
      onShare,
      ...overrides,
    })
  );

  return { db, onChanged, onTagsChanged, onOpen, onShare, view };
}

beforeEach(() => {
  toast.push.mockClear();
  confirm.mockReset();
  confirmResolved(true);
});

function confirmResolved(answer: boolean) {
  confirm.mockResolvedValue(answer);
}

describe("useNoteActions", () => {
  it("pins a note, toasts, and refreshes the list", async () => {
    const { db, onChanged, view } = setup();
    const query = db.queue("notes", { data: summary({ pinned: true }) });

    await view.result.current.run(summary(), "pin");

    expect(methodCalls(query, "update")).toEqual([[{ pinned: true }]]);
    expect(methodCalls(query, "eq")).toEqual([["id", "note-1"]]);
    expect(toast.push).toHaveBeenCalledWith("Note pinned.", "success");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("unarchives without asking, because it is not destructive", async () => {
    const { db, view } = setup();
    const query = db.queue("notes", { data: summary() });

    await view.result.current.run(summary({ archived: true }), "unarchive");

    expect(confirm).not.toHaveBeenCalled();
    expect(methodCalls(query, "update")).toEqual([[{ archived: false }]]);
  });

  it("asks before trashing and stops when declined", async () => {
    confirmResolved(false);
    const { db, onChanged, view } = setup();
    const query = db.queue("notes", { data: summary() });

    await view.result.current.run(summary(), "trash");

    expect(confirm).toHaveBeenCalledExactlyOnceWith({
      title: "Move to trash",
      message: "Move this note to the trash?",
      confirmLabel: "Move to trash",
      tone: "danger",
    });
    expect(methodCalls(query, "update")).toEqual([]);
    expect(toast.push).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("trashes a note once confirmed", async () => {
    const { db, onChanged, view } = setup();
    const query = db.queue("notes", { data: summary() });

    await view.result.current.run(summary(), "trash");

    const patch = methodCalls(query, "update")[0]?.[0] as {
      deleted_at: string;
    };
    expect(typeof patch.deleted_at).toBe("string");
    expect(toast.push).toHaveBeenCalledWith("Note moved to trash.", "success");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("restores a note from the trash", async () => {
    const { db, view } = setup();
    const query = db.queue("notes", { data: summary() });

    await view.result.current.run(summary({ deleted_at: "2026-10-01" }), "restore");

    expect(methodCalls(query, "update")).toEqual([[{ deleted_at: null }]]);
    expect(toast.push).toHaveBeenCalledWith("Note restored.", "success");
  });

  it("clears the note's files before deleting it permanently", async () => {
    const { db, onChanged, view } = setup();
    db.queue("attachments", {
      data: [
        {
          id: "attachment-1",
          note_id: "note-1",
          owner_id: "user-1",
          storage_path: "note-1/attachment-1.png",
          file_name: "photo.png",
          mime_type: "image/png",
          size_bytes: 1024,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      remove: { data: [], error: null },
    });
    const notes = db.queue("notes", { data: null });

    await view.result.current.run(summary(), "delete");

    expect(bucket.calls).toContainEqual({
      method: "remove",
      args: [["note-1/attachment-1.png"]],
    });
    expect(notes.calls.some((call) => call.method === "delete")).toBe(true);
    expect(toast.push).toHaveBeenCalledWith(
      "Note deleted permanently.",
      "success"
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("never deletes a note without confirmation", async () => {
    confirmResolved(false);
    const { db, view } = setup();
    const notes = db.queue("notes", { data: null });
    db.queue("attachments", { data: [] });

    await view.result.current.run(summary(), "delete");

    expect(confirm).toHaveBeenCalledExactlyOnceWith({
      title: "Delete permanently",
      message:
        "Permanently delete this note? The database record cannot be recovered.",
      confirmLabel: "Delete permanently",
      tone: "danger",
    });
    expect(notes.calls.some((call) => call.method === "delete")).toBe(false);
    expect(db.storageFrom).not.toHaveBeenCalled();
  });

  it("reports failures as an error toast", async () => {
    const { db, onChanged, view } = setup();
    db.queue("notes", { data: null, error: { message: "network down" } });

    await view.result.current.run(summary(), "pin");

    expect(toast.push).toHaveBeenCalledWith("network down", "error");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("leaves the move action to the caller's picker dialog", async () => {
    const { onChanged, onTagsChanged, view } = setup();

    await view.result.current.run(summary(), "move");

    expect(onChanged).not.toHaveBeenCalled();
    expect(onTagsChanged).not.toHaveBeenCalled();
    expect(toast.push).not.toHaveBeenCalled();
  });

  it("hands open and share to the caller without touching the database", async () => {
    const note = summary();
    const { onOpen, onShare, onChanged, view } = setup();

    await view.result.current.run(note, "open");
    await view.result.current.run(note, "share");

    expect(onOpen).toHaveBeenCalledExactlyOnceWith("note-1");
    expect(onShare).toHaveBeenCalledExactlyOnceWith(note);
    expect(onChanged).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("useNoteActions applyDrop", () => {
  it("moves a note into the notebook it was dropped on", async () => {
    const { db, onChanged, onTagsChanged, view } = setup();
    const query = db.queue("notes", {
      data: summary({ notebook_id: "notebook-1" }),
    });

    await view.result.current.applyDrop(summary(), {
      action: "move",
      notebookId: "notebook-1",
      label: "Ideas",
    });

    expect(methodCalls(query, "update")).toEqual([
      [{ notebook_id: "notebook-1" }],
    ]);
    expect(methodCalls(query, "eq")).toEqual([["id", "note-1"]]);
    expect(toast.push).toHaveBeenCalledWith("Moved to Ideas.", "success");
    expect(onChanged).toHaveBeenCalledOnce();
    expect(onTagsChanged).not.toHaveBeenCalled();
  });

  it("files a note into Unfiled", async () => {
    const { db, view } = setup();
    const query = db.queue("notes", { data: summary() });

    await view.result.current.applyDrop(summary({ notebook_id: "notebook-1" }), {
      action: "move",
      notebookId: null,
      label: "Unfiled",
    });

    expect(methodCalls(query, "update")).toEqual([[{ notebook_id: null }]]);
  });

  it("says nothing and writes nothing when the drop changes nothing", async () => {
    const { db, onChanged, view } = setup();
    const query = db.queue("notes", { data: summary() });

    await view.result.current.applyDrop(summary(), { action: "noop", label: "Unfiled" });
    await view.result.current.applyDrop(summary(), { action: "none" });

    expect(query.calls).toHaveLength(0);
    expect(toast.push).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("adds a tag, refreshes the counts, and says so", async () => {
    const { db, onChanged, onTagsChanged, view } = setup();
    const links = db.queue("note_tags", { data: null });

    await view.result.current.applyDrop(summary(), {
      action: "tag-add",
      tagId: "tag-1",
      label: "recipes",
    });

    expect(methodCalls(links, "insert")).toEqual([
      [{ note_id: "note-1", tag_id: "tag-1" }],
    ]);
    expect(toast.push).toHaveBeenCalledWith("Tagged recipes.", "success");
    expect(onTagsChanged).toHaveBeenCalledOnce();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("removes a tag it already had", async () => {
    const { db, onTagsChanged, view } = setup();
    const links = db.queue("note_tags", { data: null });

    await view.result.current.applyDrop(summary(), {
      action: "tag-remove",
      tagId: "tag-1",
      label: "recipes",
    });

    expect(methodCalls(links, "eq")).toEqual([
      ["note_id", "note-1"],
      ["tag_id", "tag-1"],
    ]);
    expect(toast.push).toHaveBeenCalledWith("Removed recipes.", "success");
    expect(onTagsChanged).toHaveBeenCalledOnce();
  });

  it("reports a failed drop as an error toast", async () => {
    const { db, onChanged, view } = setup();
    db.queue("notes", { data: null, error: { message: "permission denied" } });

    await view.result.current.applyDrop(summary(), {
      action: "move",
      notebookId: "notebook-1",
      label: "Ideas",
    });

    expect(toast.push).toHaveBeenCalledWith("permission denied", "error");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
