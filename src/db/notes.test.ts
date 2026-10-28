import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import {
  SaveNoteError,
  createNote,
  deleteNotePermanently,
  getNote,
  listNotes,
  moveNoteToNotebook,
  restoreNote,
  saveNote,
  setNoteArchived,
  setNotePinned,
  toSaveNoteError,
  trashNote,
} from "./notes";
import type { NoteRow, NoteSummaryRow } from "./database.types";

function note(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: "note-1",
    owner_id: "user-1",
    notebook_id: null,
    title: "Garden",
    body_html: "<p>Tomatoes</p>",
    body_text: "Tomatoes",
    search: null,
    pinned: false,
    archived: false,
    deleted_at: null,
    version: 1,
    last_edited_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function summary(overrides: Partial<NoteSummaryRow> = {}): NoteSummaryRow {
  return {
    ...note(),
    tags: [{ id: "tag-1", name: "Garden", color: null }],
    tag_ids: ["tag-1"],
    attachment_count: 2,
    share_count: 1,
    share_recipients: ["user-2"],
    owner_display_name: "Ana",
    my_share_permission: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("listNotes", () => {
  it("applies the default active filters, order, and page window", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [summary()] });

    const page = await listNotes(db.client);

    expect(page.notes).toEqual([summary()]);
    expect(page.page).toBe(0);
    expect(page.pageSize).toBe(30);
    expect(page.hasMore).toBe(false);
    expect(db.from).toHaveBeenCalledWith("note_summaries");
    expect(methodCalls(query, "is")).toEqual([["deleted_at", null]]);
    expect(methodCalls(query, "eq")).toEqual([["archived", false]]);
    expect(methodCalls(query, "order")).toEqual([
      ["pinned", { ascending: false }],
      ["updated_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
    expect(methodCalls(query, "range")).toEqual([[0, 30]]);
    expect(db.pendingCalls()).toEqual([]);
  });

  it("uses an offset page and reports when more rows exist", async () => {
    const db = createFakeDb();
    const rows = Array.from({ length: 11 }, (_, index) =>
      summary({ id: `note-${index}` })
    );
    const query = db.queue("note_summaries", { data: rows });

    const page = await listNotes(db.client, { page: 1, pageSize: 10 });

    expect(page.notes).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    expect(methodCalls(query, "range")).toEqual([[10, 20]]);
  });

  it("clamps page and page size to safe bounds", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [] });

    const page = await listNotes(db.client, { page: -3, pageSize: 500 });

    expect(page.page).toBe(0);
    expect(page.pageSize).toBe(100);
    expect(methodCalls(query, "range")).toEqual([[0, 100]]);
  });

  it("filters the pinned view", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [] });

    await listNotes(db.client, { view: "pinned" });

    expect(methodCalls(query, "is")).toEqual([["deleted_at", null]]);
    expect(methodCalls(query, "eq")).toEqual([
      ["archived", false],
      ["pinned", true],
    ]);
  });

  it("filters the archived view", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [] });

    await listNotes(db.client, { view: "archived" });

    expect(methodCalls(query, "is")).toEqual([["deleted_at", null]]);
    expect(methodCalls(query, "eq")).toEqual([["archived", true]]);
  });

  it("filters the trash view by deleted_at", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [] });

    await listNotes(db.client, { view: "trash" });

    expect(methodCalls(query, "not")).toEqual([["deleted_at", "is", null]]);
    expect(methodCalls(query, "eq")).toEqual([]);
  });

  it("filters by notebook and by Unfiled", async () => {
    const db = createFakeDb();
    const named = db.queue("note_summaries", { data: [] });
    const unfiled = db.queue("note_summaries", { data: [] });

    await listNotes(db.client, { notebookId: "notebook-1" });
    await listNotes(db.client, { notebookId: null });

    expect(methodCalls(named, "eq")).toContainEqual(["notebook_id", "notebook-1"]);
    expect(methodCalls(unfiled, "is")).toContainEqual(["notebook_id", null]);
  });

  it("filters by tag inside the database", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [] });

    await listNotes(db.client, { tagId: "tag-1", sort: "title", direction: "asc" });

    expect(methodCalls(query, "contains")).toEqual([["tag_ids", ["tag-1"]]]);
    expect(methodCalls(query, "order")).toContainEqual([
      "title",
      { ascending: true },
    ]);
    expect(db.from).not.toHaveBeenCalledWith("note_tags");
  });

  it("filters the shared view to the recipient", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [summary()] });

    await listNotes(db.client, { view: "shared", sharedWithUserId: "user-2" });

    expect(methodCalls(query, "gt")).toEqual([["share_count", 0]]);
    expect(methodCalls(query, "contains")).toEqual([
      ["share_recipients", ["user-2"]],
    ]);
  });

  it("uses full-text search for longer terms", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [] });

    await listNotes(db.client, { search: "garden tools" });

    expect(methodCalls(query, "textSearch")).toEqual([
      ["search", "garden tools", { type: "websearch", config: "simple" }],
    ]);
    expect(methodCalls(query, "or")).toEqual([]);
  });

  it("removes wildcard characters from short terms", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [] });

    await listNotes(db.client, { search: "5%" });

    expect(methodCalls(query, "or")).toEqual([
      ["title.ilike.%5%,body_text.ilike.%5%"],
    ]);
    expect(methodCalls(query, "textSearch")).toEqual([]);
  });

  it("ignores a search that is only wildcard characters", async () => {
    const db = createFakeDb();
    const query = db.queue("note_summaries", { data: [] });

    await listNotes(db.client, { search: "%%" });

    expect(methodCalls(query, "or")).toEqual([]);
    expect(methodCalls(query, "textSearch")).toEqual([]);
  });

  it("throws database errors", async () => {
    const db = createFakeDb();
    db.queue("note_summaries", { error: { message: "boom" } });

    await expect(listNotes(db.client)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("single-note operations", () => {
  it("reads one note", async () => {
    const db = createFakeDb();
    const query = db.queue("notes", { data: note() });

    await expect(getNote(db.client, "note-1")).resolves.toEqual(note());
    expect(methodCalls(query, "eq")).toEqual([["id", "note-1"]]);
    expect(query.calls).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("creates an empty note by default", async () => {
    const db = createFakeDb();
    const query = db.queue("notes", { data: note() });

    await createNote(db.client, {});

    expect(methodCalls(query, "insert")).toEqual([
      [{ title: "", body_html: "", notebook_id: null }],
    ]);
    expect(query.calls).toContainEqual({ method: "single", args: [] });
  });

  it("creates a note with content and a notebook", async () => {
    const db = createFakeDb();
    const query = db.queue("notes", { data: note() });

    await createNote(db.client, {
      title: "Garden",
      bodyHtml: "<p>Tomatoes</p>",
      notebookId: "notebook-1",
    });

    expect(methodCalls(query, "insert")).toEqual([
      [
        {
          title: "Garden",
          body_html: "<p>Tomatoes</p>",
          notebook_id: "notebook-1",
        },
      ],
    ]);
  });

  it("saves through the version-checked RPC", async () => {
    const db = createFakeDb();
    db.queueRpc("save_note", { data: note({ version: 2 }) });

    await expect(
      saveNote(db.client, {
        noteId: "note-1",
        expectedVersion: 1,
        title: "Garden",
        bodyHtml: "<p>Tomatoes</p>",
      })
    ).resolves.toEqual(note({ version: 2 }));

    expect(db.rpc).toHaveBeenCalledWith("save_note", {
      target_note_id: "note-1",
      expected_version: 1,
      new_title: "Garden",
      new_body_html: "<p>Tomatoes</p>",
    });
  });

  it("maps a version conflict to SaveNoteError", async () => {
    const db = createFakeDb();
    db.queueRpc("save_note", {
      error: { code: "40001", message: "version conflict" },
    });

    await expect(
      saveNote(db.client, {
        noteId: "note-1",
        expectedVersion: 1,
        title: "",
        bodyHtml: "",
      })
    ).rejects.toMatchObject({ name: "SaveNoteError", kind: "conflict" });
  });

  it("updates pinned, archived, and notebook state", async () => {
    const db = createFakeDb();
    const pinned = db.queue("notes", { data: note({ pinned: true }) });
    const archived = db.queue("notes", { data: note({ archived: true }) });
    const moved = db.queue("notes", {
      data: note({ notebook_id: "notebook-1" }),
    });

    await setNotePinned(db.client, "note-1", true);
    await setNoteArchived(db.client, "note-1", true);
    await moveNoteToNotebook(db.client, "note-1", "notebook-1");

    expect(methodCalls(pinned, "update")).toEqual([[{ pinned: true }]]);
    expect(methodCalls(archived, "update")).toEqual([[{ archived: true }]]);
    expect(methodCalls(moved, "update")).toEqual([
      [{ notebook_id: "notebook-1" }],
    ]);
  });

  it("trashes and restores a note", async () => {
    const db = createFakeDb();
    const trashed = db.queue("notes", {
      data: note({ deleted_at: "2026-01-02T03:04:05.000Z" }),
    });
    const restored = db.queue("notes", { data: note({ deleted_at: null }) });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));

    await trashNote(db.client, "note-1");
    await restoreNote(db.client, "note-1");

    expect(methodCalls(trashed, "update")).toEqual([
      [{ deleted_at: "2026-01-02T03:04:05.000Z" }],
    ]);
    expect(methodCalls(restored, "update")).toEqual([[{ deleted_at: null }]]);
  });

  it("permanently deletes a note", async () => {
    const db = createFakeDb();
    const query = db.queue("notes", { data: null });

    await deleteNotePermanently(db.client, "note-1");

    expect(query.calls.some((call) => call.method === "delete")).toBe(true);
    expect(methodCalls(query, "eq")).toEqual([["id", "note-1"]]);
  });
});

describe("toSaveNoteError", () => {
  it.each([
    ["40001", "conflict"],
    ["42501", "forbidden"],
    ["55000", "trashed"],
    ["P0002", "not_found"],
    ["XX000", "unknown"],
  ] as const)("maps %s to %s", (code, kind) => {
    expect(toSaveNoteError({ code, message: "raw" }).kind).toBe(kind);
  });

  it("keeps the original message for an unknown failure", () => {
    const error = toSaveNoteError({ code: null, message: "network down" });
    expect(error).toBeInstanceOf(SaveNoteError);
    expect(error.message).toBe("network down");
    expect(error.kind).toBe("unknown");
  });
});
