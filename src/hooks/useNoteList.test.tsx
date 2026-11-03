import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { NoteSummaryRow } from "../db/database.types";
import { SupabaseProvider } from "../db/SupabaseProvider";
import { createFakeDb } from "../test/fakeDb";
import { TEST_ENV } from "../test/fakeSupabase";
import { useNoteList } from "./useNoteList";

function summary(overrides: Partial<NoteSummaryRow> = {}): NoteSummaryRow {
  return {
    id: "note-1",
    owner_id: "user-1",
    notebook_id: "book-1",
    title: "First",
    body_html: "<p>First body</p>",
    body_text: "First body",
    search: null,
    pinned: false,
    archived: false,
    deleted_at: null,
    version: 2,
    last_edited_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    tags: [{ id: "tag-1", name: "work", color: null }],
    tag_ids: ["tag-1"],
    attachment_count: 2,
    share_count: 1,
    share_recipients: ["user-2"],
    owner_display_name: "Jo",
    my_share_permission: null,
    ...overrides,
  };
}

function wrapperFor(client: ReturnType<typeof createFakeDb>["client"]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SupabaseProvider client={client} env={TEST_ENV}>
        {children}
      </SupabaseProvider>
    );
  };
}

describe("useNoteList", () => {
  it("folds a saved note into the visible row without another query", async () => {
    const db = createFakeDb();
    db.queue("note_summaries", {
      data: [
        summary(),
        summary({ id: "note-2", title: "Second", body_text: "Second body" }),
      ],
    });

    const { result } = renderHook(() => useNoteList({ view: "all" }), {
      wrapper: wrapperFor(db.client),
    });

    await waitFor(() => expect(result.current.notes).toHaveLength(2));
    const callsBefore = db.from.mock.calls.length;

    act(() =>
      result.current.applySaved({
        ...summary(),
        title: "First edited",
        body_text: "First edited body",
        version: 3,
        updated_at: "2026-01-02T00:00:00Z",
      })
    );

    expect(result.current.notes[0]).toMatchObject({
      title: "First edited",
      body_text: "First edited body",
      version: 3,
      tags: [{ id: "tag-1", name: "work", color: null }],
      attachment_count: 2,
      share_count: 1,
    });
    expect(result.current.notes[1]?.title).toBe("Second");
    expect(db.from.mock.calls.length).toBe(callsBefore);
  });

  it("ignores a save for a note that is not in the list", async () => {
    const db = createFakeDb();
    db.queue("note_summaries", { data: [summary()] });

    const { result } = renderHook(() => useNoteList({ view: "all" }), {
      wrapper: wrapperFor(db.client),
    });
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    const before = result.current.notes;

    act(() =>
      result.current.applySaved(
        summary({ id: "note-elsewhere", title: "Not here" })
      )
    );

    expect(result.current.notes).toBe(before);
  });
});
