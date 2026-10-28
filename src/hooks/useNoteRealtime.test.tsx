import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SupabaseProvider } from "../db/SupabaseProvider";
import { createFakeDb } from "../test/fakeDb";
import { TEST_ENV } from "../test/fakeSupabase";
import { useNoteRealtime } from "./useNoteRealtime";

function wrapperFor(client: ReturnType<typeof createFakeDb>["client"]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SupabaseProvider client={client} env={TEST_ENV}>
        {children}
      </SupabaseProvider>
    );
  };
}

describe("useNoteRealtime", () => {
  it("subscribes to note and share changes and forwards payloads", () => {
    const db = createFakeDb();
    const onNoteChange = vi.fn();
    const onShareChange = vi.fn();

    const { unmount } = renderHook(
      () => useNoteRealtime("note-1", { onNoteChange, onShareChange }),
      { wrapper: wrapperFor(db.client) }
    );

    const channel = db.channels[0];
    expect(channel.name).toBe("note-note-1");
    expect(channel.bindings).toHaveLength(2);
    expect(channel.bindings[0].filter).toMatchObject({
      table: "notes",
      filter: "id=eq.note-1",
    });
    expect(channel.bindings[1].filter).toMatchObject({
      table: "note_shares",
      filter: "note_id=eq.note-1",
    });

    const notePayload = {
      eventType: "UPDATE",
      new: { id: "note-1", version: 2 },
      old: {},
    };
    const sharePayload = {
      eventType: "DELETE",
      new: {},
      old: { note_id: "note-1", shared_with: "user-2" },
    };

    act(() => channel.bindings[0].callback(notePayload));
    act(() => channel.bindings[1].callback(sharePayload));

    expect(onNoteChange).toHaveBeenCalledWith(notePayload);
    expect(onShareChange).toHaveBeenCalledWith(sharePayload);

    unmount();
    expect(db.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("does nothing without a note id", () => {
    const db = createFakeDb();
    renderHook(() => useNoteRealtime(null, {
      onNoteChange: vi.fn(),
      onShareChange: vi.fn(),
    }), { wrapper: wrapperFor(db.client) });

    expect(db.channel).not.toHaveBeenCalled();
  });
});
