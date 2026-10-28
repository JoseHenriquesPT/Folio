import { describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../test/fakeDb";
import { ATTACHMENT_BUCKET } from "./attachments";
import {
  downloadAttachmentFiles,
  fetchExportData,
  type ExportAttachmentRecord,
} from "./export";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function blob(text: string): Blob {
  // jsdom's Blob has no arrayBuffer(), so the fake matches only the shape the
  // data layer uses.
  const bytes = encoder.encode(text);
  return {
    arrayBuffer: async () => bytes.slice().buffer,
  } as unknown as Blob;
}

function noteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "n1",
    owner_id: "owner",
    notebook_id: "nb1",
    title: "Card Games",
    body_html: "<p>Body</p>",
    deleted_at: null,
    archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    tags: [{ id: "t1", name: "games", color: null }],
    ...overrides,
  };
}

function attachmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "att1",
    note_id: "n1",
    owner_id: "owner",
    storage_path: "n1/att1.png",
    file_name: "shot.png",
    mime_type: "image/png",
    size_bytes: 10,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function record(
  overrides: Partial<ExportAttachmentRecord> &
    Pick<ExportAttachmentRecord, "id">
): ExportAttachmentRecord {
  return {
    noteId: "n1",
    fileName: "shot.png",
    mimeType: "image/png",
    sizeBytes: 10,
    storagePath: `n1/${overrides.id}.png`,
    ...overrides,
  };
}

describe("fetchExportData", () => {
  it("maps rows into the planner shapes", async () => {
    const db = createFakeDb();
    db.queue("note_summaries", {
      data: [
        noteRow(),
        noteRow({ id: "n2", owner_id: "partner", notebook_id: null, tags: [] }),
      ],
    });
    db.queue("notebooks", {
      data: [
        {
          id: "nb1",
          owner_id: "owner",
          parent_id: null,
          name: "Ideas",
          position: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    db.queue("attachments", {
      data: [
        attachmentRow(),
        attachmentRow({ id: "att2", note_id: "n2", storage_path: "n2/att2.pdf" }),
      ],
    });

    const data = await fetchExportData(db.client, { ownerId: "owner" });

    expect(data.ownerId).toBe("owner");
    expect(data.notes).toEqual([
      {
        id: "n1",
        ownerId: "owner",
        title: "Card Games",
        bodyHtml: "<p>Body</p>",
        notebookId: "nb1",
        archived: false,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        tags: ["games"],
      },
      {
        id: "n2",
        ownerId: "partner",
        title: "Card Games",
        bodyHtml: "<p>Body</p>",
        notebookId: null,
        archived: false,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        tags: [],
      },
    ]);
    expect(data.notebooks).toEqual([{ id: "nb1", title: "Ideas", parentId: null }]);
    expect(data.attachments).toEqual([
      {
        id: "att1",
        noteId: "n1",
        fileName: "shot.png",
        mimeType: "image/png",
        sizeBytes: 10,
      },
      {
        id: "att2",
        noteId: "n2",
        fileName: "shot.png",
        mimeType: "image/png",
        sizeBytes: 10,
      },
    ]);
    expect(data.storagePaths).toEqual(
      new Map([
        ["att1", "n1/att1.png"],
        ["att2", "n2/att2.pdf"],
      ])
    );
  });

  it("pages notes until a short page arrives", async () => {
    const db = createFakeDb();
    const first = db.queue("note_summaries", {
      data: [noteRow({ id: "n1" }), noteRow({ id: "n2" })],
    });
    const second = db.queue("note_summaries", { data: [noteRow({ id: "n3" })] });
    db.queue("notebooks", { data: [] });
    db.queue("attachments", { data: [] });

    const data = await fetchExportData(db.client, { ownerId: "owner", pageSize: 2 });

    expect(data.notes.map((note) => note.id)).toEqual(["n1", "n2", "n3"]);
    expect(first.calls.filter((call) => call.method === "range").map((call) => call.args)).toEqual([
      [0, 1],
    ]);
    expect(second.calls.filter((call) => call.method === "range").map((call) => call.args)).toEqual([
      [2, 3],
    ]);
    expect(db.pendingCalls()).not.toContain("table:note_summaries");
  });

  it("reports progress while loading and downloading", async () => {
    const db = createFakeDb();
    db.queue("note_summaries", { data: [noteRow()] });
    db.queue("notebooks", { data: [] });
    db.queue("attachments", { data: [attachmentRow()] });
    const onProgress = vi.fn();

    await fetchExportData(db.client, { ownerId: "owner", onProgress });

    expect(onProgress).toHaveBeenCalledWith({
      phase: "notes",
      completed: 1,
      total: 0,
    });
    expect(onProgress).toHaveBeenCalledWith({
      phase: "attachments",
      completed: 1,
      total: 0,
    });
  });

  it("surfaces query errors", async () => {
    const db = createFakeDb();
    db.queue("note_summaries", { data: null, error: { message: "boom" } });

    await expect(fetchExportData(db.client, { ownerId: "owner" })).rejects.toEqual({
      message: "boom",
    });
  });

  it("stops between pages when cancelled", async () => {
    const controller = new AbortController();
    const db = createFakeDb();
    db.queue("note_summaries", {
      data: [noteRow({ id: "n1" }), noteRow({ id: "n2" })],
    });

    controller.abort();

    await expect(
      fetchExportData(db.client, {
        ownerId: "owner",
        pageSize: 2,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(db.pendingCalls()).toContain("table:note_summaries");
  });

  it("never asks storage for bytes", async () => {
    const db = createFakeDb();
    db.queue("note_summaries", { data: [] });
    db.queue("notebooks", { data: [] });
    db.queue("attachments", { data: [] });

    await fetchExportData(db.client, { ownerId: "owner" });

    expect(db.storageFrom).not.toHaveBeenCalled();
  });
});

describe("downloadAttachmentFiles", () => {
  it("returns the bytes of every attachment by id", async () => {
    const db = createFakeDb();
    db.queueStorage(ATTACHMENT_BUCKET, {
      download: async (path) => ({ data: blob(`bytes:${path}`), error: null }),
    });

    const files = await downloadAttachmentFiles({
      client: db.client,
      attachments: [record({ id: "att1" }), record({ id: "att2", storagePath: "n1/att2.jpg" })],
    });

    expect([...files.keys()]).toEqual(["att1", "att2"]);
    expect(decoder.decode(files.get("att1"))).toBe("bytes:n1/att1.png");
    expect(decoder.decode(files.get("att2"))).toBe("bytes:n1/att2.jpg");
  });

  it("caps how many downloads run at once", async () => {
    const db = createFakeDb();
    let inFlight = 0;
    let peak = 0;

    db.queueStorage(ATTACHMENT_BUCKET, {
      download: async (path) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return { data: blob(path), error: null };
      },
    });

    const attachments = Array.from({ length: 25 }, (_, index) =>
      record({ id: `att${index}` })
    );

    const files = await downloadAttachmentFiles({
      client: db.client,
      attachments,
      concurrency: 8,
    });

    expect(files.size).toBe(25);
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });

  it("reports progress as files finish", async () => {
    const db = createFakeDb();
    db.queueStorage(ATTACHMENT_BUCKET, {
      download: async () => ({ data: blob("x"), error: null }),
    });
    const onProgress = vi.fn();

    await downloadAttachmentFiles({
      client: db.client,
      attachments: [record({ id: "att1" }), record({ id: "att2" })],
      concurrency: 1,
      onProgress,
    });

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("stops scheduling once cancelled", async () => {
    const db = createFakeDb();
    const download = vi.fn(async () => ({ data: blob("x"), error: null }));
    db.queueStorage(ATTACHMENT_BUCKET, { download });

    const controller = new AbortController();
    controller.abort();

    await expect(
      downloadAttachmentFiles({
        client: db.client,
        attachments: [record({ id: "att1" }), record({ id: "att2" })],
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(download).not.toHaveBeenCalled();
  });

  it("aborts after an in-flight batch finishes", async () => {
    const db = createFakeDb();
    const controller = new AbortController();
    const download = vi.fn(async (path: string) => {
      controller.abort();
      return { data: blob(path), error: null };
    });
    db.queueStorage(ATTACHMENT_BUCKET, { download });

    await expect(
      downloadAttachmentFiles({
        client: db.client,
        attachments: [record({ id: "att1" }), record({ id: "att2" }), record({ id: "att3" })],
        concurrency: 1,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(download).toHaveBeenCalledTimes(1);
  });

  it("surfaces a storage failure", async () => {
    const db = createFakeDb();
    db.queueStorage(ATTACHMENT_BUCKET, {
      download: async () => ({ data: null, error: { message: "denied" } }),
    });

    await expect(
      downloadAttachmentFiles({
        client: db.client,
        attachments: [record({ id: "att1" })],
      })
    ).rejects.toEqual({ message: "denied" });
  });

  it("treats empty data as a failure", async () => {
    const db = createFakeDb();
    db.queueStorage(ATTACHMENT_BUCKET, {
      download: async () => ({ data: null, error: null }),
    });

    await expect(
      downloadAttachmentFiles({
        client: db.client,
        attachments: [record({ id: "att1", fileName: "shot.png" })],
      })
    ).rejects.toThrow("shot.png");
  });

  it("skips storage entirely for an empty list", async () => {
    const db = createFakeDb();

    const files = await downloadAttachmentFiles({
      client: db.client,
      attachments: [],
    });

    expect(files.size).toBe(0);
    expect(db.storageFrom).not.toHaveBeenCalled();
  });
});
