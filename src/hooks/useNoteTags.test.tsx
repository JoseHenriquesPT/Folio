import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TagSummaryRow } from "../db/database.types";
import { createFakeDb } from "../test/fakeDb";
import { useNoteTags } from "./useNoteTags";

const toast = { push: vi.fn() };

beforeEach(() => {
  toast.push.mockClear();
});

function tag(overrides: Partial<TagSummaryRow> = {}): TagSummaryRow {
  return {
    id: "tag-1",
    owner_id: "user-1",
    name: "work",
    color: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    note_count: 1,
    ...overrides,
  };
}

const options = (
  db: ReturnType<typeof createFakeDb>,
  overrides: Record<string, unknown> = {}
) => ({
  client: db.client,
  noteId: "note-1" as string | null,
  canManage: true,
  toast,
  onTagsChanged: vi.fn(),
  ...overrides,
});

describe("useNoteTags", () => {
  it("loads the tags attached to the note", async () => {
    const db = createFakeDb();
    db.queue("note_tags", { data: [{ tag_id: "tag-1" }] });
    db.queue("tags", { data: [tag()] });

    const { result } = renderHook(() => useNoteTags(options(db)));

    await waitFor(() => expect(result.current.noteTags).toHaveLength(1));
    expect(result.current.noteTags[0]?.name).toBe("work");
  });

  it("clears without querying when there is no note yet", () => {
    const db = createFakeDb();
    const { result } = renderHook(() =>
      useNoteTags(options(db, { noteId: null }))
    );

    expect(result.current.noteTags).toEqual([]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("attaches a new tag and refreshes the workspace", async () => {
    const db = createFakeDb();
    db.queue("note_tags", { data: [] });
    const onTagsChanged = vi.fn();
    const { result } = renderHook(() =>
      useNoteTags(options(db, { onTagsChanged }))
    );
    await waitFor(() => expect(db.from).toHaveBeenCalled());

    const insert = db.queue("note_tags", { data: null });
    await act(async () => {
      await result.current.toggle(tag());
    });

    expect(insert.calls.some((call) => call.method === "insert")).toBe(true);
    expect(onTagsChanged).toHaveBeenCalledOnce();
    expect(result.current.noteTags).toHaveLength(1);
  });

  it("does nothing for a reader", async () => {
    const db = createFakeDb();
    db.queue("note_tags", { data: [] });
    const onTagsChanged = vi.fn();
    const { result } = renderHook(() =>
      useNoteTags(options(db, { canManage: false, onTagsChanged }))
    );
    await waitFor(() => expect(db.from).toHaveBeenCalled());

    await act(async () => {
      await result.current.toggle(tag());
    });

    expect(onTagsChanged).not.toHaveBeenCalled();
    expect(result.current.noteTags).toEqual([]);
  });
});
