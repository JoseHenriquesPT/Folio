import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentRow } from "../db/database.types";
import { ATTACHMENT_BUCKET } from "../db/attachments";
import { attachmentRef } from "../lib/attachments";
import { createFakeDb } from "../test/fakeDb";
import { useNoteAttachments } from "./useNoteAttachments";

const toast = { push: vi.fn() };

beforeEach(() => {
  toast.push.mockClear();
});

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

const options = (db: ReturnType<typeof createFakeDb>, overrides = {}) => ({
  client: db.client,
  noteId: "note-1" as string | null,
  canEdit: true,
  isOwner: true,
  toast,
  ...overrides,
});

describe("useNoteAttachments", () => {
  it("loads a note's attachments and signs only images", async () => {
    const db = createFakeDb();
    db.queue("attachments", {
      data: [
        attachment(),
        attachment({
          id: "attachment-2",
          storage_path: "note-1/attachment-2.pdf",
          file_name: "file.pdf",
          mime_type: "application/pdf",
        }),
      ],
    });
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: {
        data: [
          {
            path: "note-1/attachment-1.png",
            signedUrl: "https://example.test/one",
            error: null,
          },
        ],
        error: null,
      },
    });

    const { result } = renderHook(() => useNoteAttachments(options(db)));

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items[0]?.url).toBe("https://example.test/one");
    expect(result.current.items[0]?.isImage).toBe(true);
    expect(result.current.items[1]?.url).toBeNull();
    expect(result.current.items[1]?.isImage).toBe(false);
    expect(result.current.loadedNoteId).toBe("note-1");
    expect(bucket.calls).toContainEqual({
      method: "createSignedUrls",
      args: [["note-1/attachment-1.png"], 3600],
    });
  });

  it("starts empty when there is no saved note", () => {
    const db = createFakeDb();
    const { result } = renderHook(() =>
      useNoteAttachments(options(db, { noteId: null }))
    );

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.loadedNoteId).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects a file over the limit without calling the database", async () => {
    const db = createFakeDb();
    db.queue("attachments", { data: [] });
    const { result } = renderHook(() => useNoteAttachments(options(db)));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const huge = new File(["x"], "huge.zip", { type: "application/zip" });
    Object.defineProperty(huge, "size", { value: 21 * 1024 * 1024 });

    await act(async () => {
      await result.current.upload([huge]);
    });

    expect(result.current.items).toEqual([]);
    expect(toast.push).toHaveBeenCalledWith(
      "huge.zip is larger than the 20 MB limit.",
      "error"
    );
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("uploads accepted files and refreshes the list", async () => {
    const db = createFakeDb();
    db.queue("attachments", { data: [] });
    const { result } = renderHook(() => useNoteAttachments(options(db)));
    await waitFor(() => expect(result.current.loading).toBe(false));

    db.queue("attachments", { data: attachment() });
    db.queueStorage(ATTACHMENT_BUCKET, {
      upload: { data: { path: "note-1/attachment-1.png" }, error: null },
    });
    db.queue("attachments", { data: [attachment()] });
    db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: {
        data: [
          {
            path: "note-1/attachment-1.png",
            signedUrl: "https://example.test/one",
            error: null,
          },
        ],
        error: null,
      },
    });

    const file = new File(["hello"], "photo.png", { type: "image/png" });
    let uploaded: Awaited<ReturnType<typeof result.current.upload>> = [];

    await act(async () => {
      uploaded = await result.current.upload([file]);
    });

    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]?.file_name).toBe("photo.png");
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.url).toBe("https://example.test/one");
  });

  it("does not let a non-owner delete an attachment", async () => {
    const db = createFakeDb();
    db.queue("attachments", { data: [attachment()] });
    db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: { data: [], error: null },
    });
    const { result } = renderHook(() =>
      useNoteAttachments(options(db, { isOwner: false }))
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let removed = true;
    await act(async () => {
      removed = await result.current.remove(result.current.items[0]!);
    });

    expect(removed).toBe(false);
    expect(result.current.items).toHaveLength(1);
  });

  it("deletes the object before the record", async () => {
    const db = createFakeDb();
    db.queue("attachments", { data: [attachment()] });
    db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: { data: [], error: null },
    });
    const { result } = renderHook(() => useNoteAttachments(options(db)));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      remove: { data: [], error: null },
    });
    db.queue("attachments", { data: null });

    await act(async () => {
      await result.current.remove(result.current.items[0]!);
    });

    expect(bucket.calls).toContainEqual({
      method: "remove",
      args: [["note-1/attachment-1.png"]],
    });
    expect(result.current.items).toEqual([]);
  });

  it("keeps the record when the object cannot be removed", async () => {
    const db = createFakeDb();
    db.queue("attachments", { data: [attachment()] });
    db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: { data: [], error: null },
    });
    const { result } = renderHook(() => useNoteAttachments(options(db)));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    db.queueStorage(ATTACHMENT_BUCKET, {
      remove: { data: null, error: { message: "storage down" } },
    });

    await act(async () => {
      await result.current.remove(result.current.items[0]!);
    });

    expect(toast.push).toHaveBeenCalledWith("storage down", "error");
    expect(result.current.items).toHaveLength(1);
  });

  it("reports cleanup results for permanent note deletion", async () => {
    const db = createFakeDb();
    db.queue("attachments", { data: [] });
    const { result } = renderHook(() => useNoteAttachments(options(db)));
    await waitFor(() => expect(result.current.loading).toBe(false));

    db.queue("attachments", {
      data: [
        attachment(),
        attachment({ id: "attachment-2", storage_path: "note-1/two.png" }),
      ],
    });
    const bucket = db.queueStorage(ATTACHMENT_BUCKET, {
      remove: { data: [], error: null },
    });

    let cleanup: Awaited<ReturnType<typeof result.current.removeAll>> | null = null;
    await act(async () => {
      cleanup = await result.current.removeAll();
    });

    expect(cleanup).toEqual({ ok: true, removed: 2 });
    expect(bucket.calls).toContainEqual({
      method: "remove",
      args: [["note-1/attachment-1.png", "note-1/two.png"]],
    });
  });

  it("resolves refs for display and restores them before saving", async () => {
    const db = createFakeDb();
    db.queue("attachments", { data: [attachment()] });
    db.queueStorage(ATTACHMENT_BUCKET, {
      signedUrl: {
        data: [
          {
            path: "note-1/attachment-1.png",
            signedUrl: "https://example.test/one",
            error: null,
          },
        ],
        error: null,
      },
    });
    const { result } = renderHook(() => useNoteAttachments(options(db)));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const html = `<img src="${attachmentRef("attachment-1")}">`;
    expect(result.current.resolveHtml(html)).toBe(
      '<img src="https://example.test/one">'
    );
    expect(
      result.current.restoreHtml('<img src="https://example.test/one">')
    ).toBe(html);
    expect(result.current.imageSrcFor(attachmentRef("attachment-1"))).toBe(
      "https://example.test/one"
    );
  });
});
