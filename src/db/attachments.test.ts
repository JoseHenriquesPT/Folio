import { describe, expect, it } from "vitest";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import {
  ATTACHMENT_BUCKET,
  buildAttachmentPath,
  createAttachment,
  createDownloadUrl,
  createSignedUrls,
  deleteAttachment,
  getAttachmentUsage,
  listAttachments,
  removeAttachmentObject,
  removeAttachmentsForNote,
  uploadAttachment,
  uploadAttachmentObject,
} from "./attachments";
import type { AttachmentRow } from "./database.types";

function attachment(overrides: Partial<AttachmentRow> = {}): AttachmentRow {
  return {
    id: "attachment-1",
    note_id: "note-1",
    owner_id: "user-1",
    storage_path: "note-1/attachment-1.png",
    file_name: "photo.png",
    mime_type: "image/png",
    size_bytes: 1024,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("attachment paths", () => {
  it("builds the note/id.extension path", () => {
    expect(buildAttachmentPath("note-1", "attachment-1", "Photo.PNG")).toBe(
      "note-1/attachment-1.png"
    );
  });

  it("keeps the last extension", () => {
    expect(buildAttachmentPath("note-1", "attachment-1", "archive.tar.gz")).toBe(
      "note-1/attachment-1.gz"
    );
  });

  it("falls back to bin when there is no extension", () => {
    expect(buildAttachmentPath("note-1", "attachment-1", "README")).toBe(
      "note-1/attachment-1.bin"
    );
  });
});

describe("attachments data layer", () => {
  it("creates an attachment record with a client-generated path", async () => {
    const db = createFakeDb();
    const query = db.queue("attachments", { data: attachment() });

    await expect(
      createAttachment(db.client, {
        id: "attachment-1",
        noteId: "note-1",
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1024,
      })
    ).resolves.toEqual(attachment());

    expect(methodCalls(query, "insert")).toEqual([
      [
        {
          id: "attachment-1",
          note_id: "note-1",
          storage_path: "note-1/attachment-1.png",
          file_name: "photo.png",
          mime_type: "image/png",
          size_bytes: 1024,
        },
      ],
    ]);
  });

  it("generates an id when the caller does not supply one", async () => {
    const db = createFakeDb();
    const query = db.queue("attachments", { data: attachment() });

    await createAttachment(db.client, {
      noteId: "note-1",
      fileName: "photo.png",
      mimeType: "image/png",
      sizeBytes: 1024,
    });

    const payload = methodCalls(query, "insert")[0]?.[0] as {
      id: string;
      storage_path: string;
    };
    expect(payload.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(payload.storage_path).toBe(`note-1/${payload.id}.png`);
  });

  it("lists a note's attachments", async () => {
    const db = createFakeDb();
    const query = db.queue("attachments", { data: [attachment()] });

    await expect(listAttachments(db.client, "note-1")).resolves.toEqual([
      attachment(),
    ]);
    expect(methodCalls(query, "eq")).toEqual([["note_id", "note-1"]]);
    expect(methodCalls(query, "order")).toEqual([
      ["created_at", { ascending: true }],
    ]);
  });

  it("deletes an attachment record", async () => {
    const db = createFakeDb();
    const query = db.queue("attachments", { data: null });

    await deleteAttachment(db.client, "attachment-1");
    expect(query.calls.some((call) => call.method === "delete")).toBe(true);
    expect(methodCalls(query, "eq")).toEqual([["id", "attachment-1"]]);
  });

  it("creates a signed download URL", async () => {
    const db = createFakeDb();
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: { data: { signedUrl: "https://example.test/file" }, error: null },
    });

    await expect(
      createDownloadUrl(db.client, "note-1/attachment-1.png", { expiresIn: 120 })
    ).resolves.toBe("https://example.test/file");
    expect(db.storageFrom).toHaveBeenCalledWith(ATTACHMENT_BUCKET);
    expect(bucket.calls).toContainEqual({
      method: "createSignedUrl",
      args: ["note-1/attachment-1.png", 120],
    });
  });

  it("uploads an object to the private bucket", async () => {
    const db = createFakeDb();
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      upload: { data: { path: "note-1/attachment-1.png" }, error: null },
    });
    const file = new File(["hello"], "photo.png", { type: "image/png" });

    await uploadAttachmentObject(db.client, "note-1/attachment-1.png", file);
    expect(bucket.calls).toContainEqual({
      method: "upload",
      args: [
        "note-1/attachment-1.png",
        file,
        { contentType: "image/png", upsert: false },
      ],
    });
  });

  it("removes storage objects", async () => {
    const db = createFakeDb();
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      remove: { data: [], error: null },
    });

    await removeAttachmentObject(db.client, ["note-1/attachment-1.png"]);
    expect(bucket.calls).toContainEqual({
      method: "remove",
      args: [["note-1/attachment-1.png"]],
    });
  });

  it("removes every stored file of a note and counts them", async () => {
    const db = createFakeDb();
    db.queue("attachments", {
      data: [
        attachment(),
        attachment({
          id: "attachment-2",
          storage_path: "note-1/attachment-2.png",
        }),
      ],
    });
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      remove: { data: [], error: null },
    });

    await expect(removeAttachmentsForNote(db.client, "note-1")).resolves.toBe(
      2
    );
    expect(bucket.calls).toContainEqual({
      method: "remove",
      args: [["note-1/attachment-1.png", "note-1/attachment-2.png"]],
    });
  });

  it("leaves storage alone when the note has no files", async () => {
    const db = createFakeDb();
    db.queue("attachments", { data: [] });

    await expect(removeAttachmentsForNote(db.client, "note-1")).resolves.toBe(
      0
    );
    expect(db.storageFrom).not.toHaveBeenCalled();
  });

  it("throws storage errors", async () => {
    const db = createFakeDb();
    db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: { data: null, error: { message: "nope" } },
    });

    await expect(
      createDownloadUrl(db.client, "note-1/attachment-1.png")
    ).rejects.toMatchObject({ message: "nope" });
  });
});

describe("attachment upload flow", () => {
  it("writes the record, then uploads the bytes", async () => {
    const db = createFakeDb();
    db.queue("attachments", { data: attachment() });
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      upload: { data: { path: "note-1/attachment-1.png" }, error: null },
    });
    const file = new File(["hello"], "photo.png", { type: "image/png" });

    await expect(
      uploadAttachment(db.client, { noteId: "note-1", file, id: "attachment-1" })
    ).resolves.toEqual(attachment());

    expect(bucket.calls).toContainEqual({
      method: "upload",
      args: [
        "note-1/attachment-1.png",
        file,
        { contentType: "image/png", upsert: false },
      ],
    });
  });

  it("rolls the record back when the object upload fails", async () => {
    const db = createFakeDb();
    const insert = db.queue("attachments", { data: attachment() });
    db.queueStorage(ATTACHMENT_BUCKET, {
      upload: { data: null, error: { message: "storage down" } },
    });
    const rollback = db.queue("attachments", { data: null });
    const file = new File(["hello"], "photo.png", { type: "image/png" });

    await expect(
      uploadAttachment(db.client, { noteId: "note-1", file, id: "attachment-1" })
    ).rejects.toMatchObject({ message: "storage down" });

    expect(methodCalls(insert, "insert")).toHaveLength(1);
    expect(rollback.calls.some((call) => call.method === "delete")).toBe(true);
    expect(methodCalls(rollback, "eq")).toEqual([["id", "attachment-1"]]);
  });
});

describe("signed URLs", () => {
  it("signs many objects in one call", async () => {
    const db = createFakeDb();
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: {
        data: [
          {
            path: "note-1/attachment-1.png",
            signedUrl: "https://example.test/one",
            error: null,
          },
          {
            path: "note-1/attachment-2.png",
            signedUrl: null,
            error: "missing",
          },
        ],
        error: null,
      },
    });

    const urls = await createSignedUrls(
      db.client,
      ["note-1/attachment-1.png", "note-1/attachment-2.png"],
      600
    );

    expect(urls).toEqual(
      new Map([["note-1/attachment-1.png", "https://example.test/one"]])
    );
    expect(bucket.calls).toContainEqual({
      method: "createSignedUrls",
      args: [["note-1/attachment-1.png", "note-1/attachment-2.png"], 600],
    });
  });

  it("skips the request when there is nothing to sign", async () => {
    const db = createFakeDb();
    await expect(createSignedUrls(db.client, [])).resolves.toEqual(new Map());
    expect(db.storageFrom).not.toHaveBeenCalled();
  });

  it("asks for a download disposition when a file name is given", async () => {
    const db = createFakeDb();
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: { data: { signedUrl: "https://example.test/file" }, error: null },
    });

    await createDownloadUrl(db.client, "note-1/attachment-1.png", {
      expiresIn: 600,
      downloadName: "photo.png",
    });
    expect(bucket.calls).toContainEqual({
      method: "createSignedUrl",
      args: ["note-1/attachment-1.png", 600, { download: "photo.png" }],
    });
  });
});

describe("attachment usage", () => {
  it("reads the project total", async () => {
    const db = createFakeDb();
    const query = db.queueRpc("attachment_usage", {
      data: { total_bytes: 2048, attachment_count: 3 },
    });

    await expect(getAttachmentUsage(db.client)).resolves.toEqual({
      totalBytes: 2048,
      attachmentCount: 3,
    });
    expect(methodCalls(query, "single")).toHaveLength(1);
  });

  it("surfaces an RPC error", async () => {
    const db = createFakeDb();
    db.queueRpc("attachment_usage", { error: { message: "denied" } });

    await expect(getAttachmentUsage(db.client)).rejects.toMatchObject({
      message: "denied",
    });
  });
});
