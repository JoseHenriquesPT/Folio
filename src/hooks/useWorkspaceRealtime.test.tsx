import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SupabaseProvider } from "../db/SupabaseProvider";
import { createFakeDb } from "../test/fakeDb";
import { TEST_ENV } from "../test/fakeSupabase";
import { useWorkspaceRealtime } from "./useWorkspaceRealtime";

function wrapperFor(client: ReturnType<typeof createFakeDb>["client"]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SupabaseProvider client={client} env={TEST_ENV}>
        {children}
      </SupabaseProvider>
    );
  };
}

describe("useWorkspaceRealtime", () => {
  it("refreshes the list after another user edits a note", () => {
    const db = createFakeDb();
    const onChange = vi.fn();

    renderHook(() => useWorkspaceRealtime("user-1", onChange), {
      wrapper: wrapperFor(db.client),
    });

    const channel = db.channels[0];
    expect(channel.name).toBe("workspace-user-1");
    expect(channel.bindings.map((binding) => binding.filter)).toMatchObject([
      { table: "notes" },
      { table: "note_shares" },
    ]);

    act(() =>
      channel.bindings[0].callback({
        eventType: "UPDATE",
        new: { id: "note-1", last_edited_by: "user-2" },
        old: {},
      })
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("skips this user's own note updates", () => {
    const db = createFakeDb();
    const onChange = vi.fn();

    renderHook(() => useWorkspaceRealtime("user-1", onChange), {
      wrapper: wrapperFor(db.client),
    });

    act(() =>
      db.channels[0].bindings[0].callback({
        eventType: "UPDATE",
        new: { id: "note-1", last_edited_by: "user-1" },
        old: {},
      })
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refreshes the list when shares change", () => {
    const db = createFakeDb();
    const onChange = vi.fn();

    renderHook(() => useWorkspaceRealtime("user-1", onChange), {
      wrapper: wrapperFor(db.client),
    });

    act(() =>
      db.channels[0].bindings[1].callback({
        eventType: "DELETE",
        new: {},
        old: { id: "share-1" },
      })
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe when disabled", () => {
    const db = createFakeDb();

    renderHook(() => useWorkspaceRealtime("user-1", vi.fn(), false), {
      wrapper: wrapperFor(db.client),
    });
    expect(db.channel).not.toHaveBeenCalled();
  });
});
