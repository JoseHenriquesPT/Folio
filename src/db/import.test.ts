import { describe, expect, it, vi } from "vitest";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import { ATTACHMENT_BUCKET } from "./attachments";
import { runJoplinImport } from "./import";
import type { JoplinImportPlan, JoplinResource } from "../lib/joplin";

const NOW = new Date("2026-10-28T09:00:00.000Z");
const ROOT = "Imported from Joplin — 2026-10-28";

function notebookRow(id: string, name: string, parentId: string | null = null) {
  return {
    id,
    owner_id: "user-1",
    parent_id: parentId,
    name,
    position: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function noteRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    owner_id: "user-1",
    notebook_id: null,
    title: "Untitled",
    body_html: "",
    body_text: "",
    search: null,
    pinned: false,
    archived: false,
    deleted_at: null,
    version: 1,
    last_edited_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function resource(overrides: Partial<JoplinResource> = {}): JoplinResource {
  return {
    id: "0123456789abcdef0123456789abcdef",
    fileName: "shot.png",
    mimeType: "image/png",
    bytes: new Uint8Array([1, 2, 3]),
    ...overrides,
  };
}

function plan(overrides: Partial<JoplinImportPlan> = {}): JoplinImportPlan {
  return {
    notebooks: [
      { id: "nb-a", title: "Ideas", parentId: null, createdAt: null, updatedAt: null },
      { id: "nb-b", title: "Web", parentId: "nb-a", createdAt: null, updatedAt: null },
    ],
    notes: [
      {
        id: "note-a",
        title: "Card Games",
        bodyHtml: "<p>Body</p>",
        notebookId: "nb-b",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-02-01T00:00:00Z",
        resourceIds: [],
      },
      {
        id: "note-b",
        title: "Loose",
        bodyHtml: "<p>Loose body</p>",
        notebookId: null,
        createdAt: null,
        updatedAt: null,
        resourceIds: [],
      },
    ],
    resources: [],
    skipped: [],
    warnings: [],
    counts: { notes: 2, notebooks: 2, resources: 0, skipped: 0, rewrittenLinks: 0 },
    ...overrides,
  };
}

function ids() {
  let next = 0;
  return () => `new-${(next += 1)}`;
}

describe("runJoplinImport", () => {
  it("creates a dated root notebook and the Joplin tree beneath it", async () => {
    const db = createFakeDb();
    const root = db.queue("notebooks", { data: notebookRow("root-1", ROOT) });
    const ideas = db.queue("notebooks", { data: notebookRow("ideas-1", "Ideas", "root-1") });
    const web = db.queue("notebooks", { data: notebookRow("web-1", "Web", "ideas-1") });
    db.queue("notes", { data: noteRow("note-1") });
    db.queue("notes", { data: noteRow("note-2") });

    const result = await runJoplinImport({
      client: db.client,
      plan: plan(),
      now: NOW,
      newId: ids(),
    });

    expect(methodCalls(root, "insert")).toEqual([
      [{ name: ROOT, parent_id: null, position: 0 }],
    ]);
    expect(methodCalls(ideas, "insert")).toEqual([
      [{ name: "Ideas", parent_id: "root-1", position: 0 }],
    ]);
    expect(methodCalls(web, "insert")).toEqual([
      [{ name: "Web", parent_id: "ideas-1", position: 0 }],
    ]);
    expect(result).toMatchObject({
      rootNotebookId: "root-1",
      rootNotebookName: ROOT,
      notebooks: 3,
      notes: 2,
      cancelled: false,
      failures: [],
    });
  });

  it("keeps note timestamps and maps notebooks", async () => {
    const db = createFakeDb();
    db.queue("notebooks", { data: notebookRow("root-1", ROOT) });
    db.queue("notebooks", { data: notebookRow("ideas-1", "Ideas", "root-1") });
    db.queue("notebooks", { data: notebookRow("web-1", "Web", "ideas-1") });
    const first = db.queue("notes", { data: noteRow("note-1") });
    const second = db.queue("notes", { data: noteRow("note-2") });

    await runJoplinImport({ client: db.client, plan: plan(), now: NOW, newId: ids() });

    expect(methodCalls(first, "insert")).toEqual([
      [
        {
          title: "Card Games",
          body_html: "<p>Body</p>",
          notebook_id: "web-1",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-02-01T00:00:00Z",
        },
      ],
    ]);
    expect(methodCalls(second, "insert")).toEqual([
      [
        {
          title: "Loose",
          body_html: "<p>Loose body</p>",
          notebook_id: "root-1",
        },
      ],
    ]);
  });

  it("uploads resources with rewritten refs", async () => {
    const db = createFakeDb();
    db.queue("notebooks", { data: notebookRow("root-1", ROOT) });
    db.queue("notes", {
      data: noteRow("note-1", {
        body_html: '<p><img src="attachment:new-1"></p>',
      }),
    });
    const attachment = db.queue("attachments", {
      data: {
        id: "new-1",
        note_id: "note-1",
        owner_id: "user-1",
        storage_path: "note-1/new-1.png",
        file_name: "shot.png",
        mime_type: "image/png",
        size_bytes: 3,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    });
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, { upload: { data: {} } });

    const result = await runJoplinImport({
      client: db.client,
      plan: plan({
        notebooks: [],
        notes: [
          {
            id: "note-a",
            title: "Shot",
            bodyHtml: '<p><img src="attachment:0123456789abcdef0123456789abcdef"></p>',
            notebookId: null,
            createdAt: null,
            updatedAt: null,
            resourceIds: ["0123456789abcdef0123456789abcdef"],
          },
        ],
        resources: [resource()],
      }),
      now: NOW,
      newId: ids(),
    });

    expect(methodCalls(attachment, "insert")).toEqual([
      [
        {
          id: "new-1",
          note_id: "note-1",
          storage_path: "note-1/new-1.png",
          file_name: "shot.png",
          mime_type: "image/png",
          size_bytes: 3,
        },
      ],
    ]);
    expect(methodCalls(bucket, "upload")).toHaveLength(1);
    expect(methodCalls(bucket, "upload")[0][0]).toBe("note-1/new-1.png");
    expect(result).toMatchObject({ notes: 1, attachments: 1, failures: [] });
  });

  it("strips a ref when its upload fails and keeps the note", async () => {
    const db = createFakeDb();
    db.queue("notebooks", { data: notebookRow("root-1", ROOT) });
    db.queue("notes", { data: noteRow("note-1") });
    db.queue("attachments", {
      data: {
        id: "new-2",
        note_id: "note-1",
        owner_id: "user-1",
        storage_path: "note-1/new-2.png",
        file_name: "shot.png",
        mime_type: "image/png",
        size_bytes: 3,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    });
    db.queueStorage(ATTACHMENT_BUCKET, { upload: { error: { message: "denied" } } });
    db.queue("attachments", { data: null, error: { message: "cleanup" } });
    db.queueRpc("save_note", {
      data: noteRow("note-1", { version: 2, body_html: "" }),
    });

    const result = await runJoplinImport({
      client: db.client,
      plan: plan({
        notebooks: [],
        notes: [
          {
            id: "note-a",
            title: "Shot",
            bodyHtml: '<p><img src="attachment:0123456789abcdef0123456789abcdef"><span>keep</span></p>',
            notebookId: null,
            createdAt: null,
            updatedAt: null,
            resourceIds: ["0123456789abcdef0123456789abcdef"],
          },
        ],
        resources: [resource()],
      }),
      now: NOW,
      newId: ids(),
    });

    expect(db.rpc).toHaveBeenCalledWith("save_note", 
      {
        target_note_id: "note-1",
        expected_version: 1,
        new_title: "Untitled",
        new_body_html: "<p><span>keep</span></p>",
      }
    );
    expect(result.failures).toEqual([
      { kind: "attachment", name: "shot.png", message: "denied" },
    ]);
    expect(result.attachments).toBe(0);
  });

  it("records note failures and keeps importing", async () => {
    const db = createFakeDb();
    db.queue("notebooks", { data: notebookRow("root-1", ROOT) });
    db.queue("notes", { data: null, error: { message: "insert failed" } });
    db.queue("notes", { data: noteRow("note-2") });

    const result = await runJoplinImport({
      client: db.client,
      plan: plan({ notebooks: [] }),
      now: NOW,
      newId: ids(),
    });

    expect(result.notes).toBe(1);
    expect(result.failures).toEqual([
      { kind: "note", name: "Card Games", message: "insert failed" },
    ]);
  });

  it("reports progress per phase", async () => {
    const db = createFakeDb();
    db.queue("notebooks", { data: notebookRow("root-1", ROOT) });
    db.queue("notes", { data: noteRow("note-1") });
    db.queue("notes", { data: noteRow("note-2") });
    const onProgress = vi.fn();

    await runJoplinImport({
      client: db.client,
      plan: plan({ notebooks: [] }),
      now: NOW,
      newId: ids(),
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith({ phase: "notebooks", completed: 1, total: 1 });
    expect(onProgress).toHaveBeenCalledWith({ phase: "notes", completed: 2, total: 2 });
  });

  it("stops early and keeps the partial result when cancelled", async () => {
    const db = createFakeDb();
    db.queue("notebooks", { data: notebookRow("root-1", ROOT) });
    db.queue("notes", { data: noteRow("note-1") });
    db.queue("notes", { data: noteRow("note-2") });
    const controller = new AbortController();
    const onProgress = vi.fn((progress: { phase: string; completed: number }) => {
      if (progress.phase === "notes" && progress.completed === 1) controller.abort();
    });

    const result = await runJoplinImport({
      client: db.client,
      plan: plan({ notebooks: [] }),
      now: NOW,
      newId: ids(),
      signal: controller.signal,
      onProgress,
    });

    expect(result).toMatchObject({ notes: 1, cancelled: true });
    expect(db.pendingCalls()).toContain("table:notes");
  });

  it("skips attachments rejected by the size or type rules", async () => {
    const db = createFakeDb();
    db.queue("notebooks", { data: notebookRow("root-1", ROOT) });
    db.queue("notes", { data: noteRow("note-1") });
    db.queueRpc("save_note", { data: noteRow("note-1", { version: 2 }) });

    const result = await runJoplinImport({
      client: db.client,
      plan: plan({
        notebooks: [],
        notes: [
          {
            id: "note-a",
            title: "Big",
            bodyHtml: '<p><a href="attachment:0123456789abcdef0123456789abcdef">file</a></p>',
            notebookId: null,
            createdAt: null,
            updatedAt: null,
            resourceIds: ["0123456789abcdef0123456789abcdef"],
          },
        ],
        resources: [resource({ fileName: "huge.bin", mimeType: "application/octet-stream", bytes: new Uint8Array(21 * 1024 * 1024) })],
      }),
      now: NOW,
      newId: ids(),
    });

    expect(db.storageFrom).not.toHaveBeenCalled();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ kind: "attachment", name: "huge.bin" });
  });
});
