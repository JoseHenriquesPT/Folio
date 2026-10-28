import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteRow } from "../db/database.types";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import { useNoteSharing } from "./useNoteSharing";

const toast = { push: vi.fn() };

beforeEach(() => {
  toast.push.mockClear();
});

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

describe("useNoteSharing", () => {
  it("counts the recipients of a note the user owns", async () => {
    const db = createFakeDb();
    const query = db.queue("note_shares", {
      data: [{ id: "share-1" }, { id: "share-2" }],
    });
    const row = note();

    const { result } = renderHook(() =>
      useNoteSharing(db.client, row, row.owner_id, toast)
    );

    await waitFor(() => expect(result.current.shareCount).toBe(2));
    expect(methodCalls(query, "eq")).toEqual([["note_id", row.id]]);
    expect(result.current.ownerName).toBeNull();
    expect(db.from).not.toHaveBeenCalledWith("public_profiles");
  });

  it("names the owner of a note shared with the user", async () => {
    const db = createFakeDb();
    db.queue("public_profiles", {
      data: { id: "user-1", display_name: "Ana" },
    });
    const row = note();

    const { result } = renderHook(() =>
      useNoteSharing(db.client, row, "user-2", toast)
    );

    await waitFor(() => expect(result.current.ownerName).toBe("Ana"));
    expect(result.current.shareCount).toBe(0);
    expect(db.from).not.toHaveBeenCalledWith("note_shares");
  });

  it("opens and closes the share dialog", async () => {
    const db = createFakeDb();
    db.queue("note_shares", { data: [] });
    const row = note();

    const { result } = renderHook(() =>
      useNoteSharing(db.client, row, row.owner_id, toast)
    );
    await waitFor(() => expect(result.current.shareCount).toBe(0));

    act(() => result.current.openShare());
    expect(result.current.shareOpen).toBe(true);

    act(() => result.current.closeShare());
    expect(result.current.shareOpen).toBe(false);
  });

  it("recounts after the recipient list changes", async () => {
    const db = createFakeDb();
    db.queue("note_shares", { data: [{ id: "share-1" }] });
    db.queue("note_shares", {
      data: [{ id: "share-1" }, { id: "share-2" }],
    });
    const row = note();

    const { result } = renderHook(() =>
      useNoteSharing(db.client, row, row.owner_id, toast)
    );
    await waitFor(() => expect(result.current.shareCount).toBe(1));

    act(() => result.current.notifySharesChanged());
    await waitFor(() => expect(result.current.shareCount).toBe(2));
  });

  it("reports a failed owner lookup", async () => {
    const db = createFakeDb();
    db.queue("public_profiles", { error: { message: "boom" } });
    const row = note();

    renderHook(() => useNoteSharing(db.client, row, "user-2", toast));

    await waitFor(() =>
      expect(toast.push).toHaveBeenCalledWith("boom", "error")
    );
  });
});
