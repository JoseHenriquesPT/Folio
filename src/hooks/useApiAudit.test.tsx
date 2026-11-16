import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../test/fakeDb";
import { useApiAudit } from "./useApiAudit";

const ROW = {
  id: 7,
  tool: "update_note",
  status: "ok",
  note_ids: ["note-1"],
  note_titles: ["Lisbon"],
  summary: { title: "Lisbon", version_to: 2 },
  token_name: "Owner write",
  token_prefix: "folio_pat_ab12cd",
  created_at: "2026-11-15T12:00:00.000Z",
  can_undo: true,
};

function setup(enabled = true) {
  const db = createFakeDb();
  const toast = { push: vi.fn() };
  const hook = renderHook(() =>
    useApiAudit({ client: db.client, toast, enabled })
  );
  return { db, toast, hook };
}

describe("useApiAudit", () => {
  it("does not call the API when the viewer is disabled", async () => {
    const { db, hook } = setup(false);

    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.audit).toEqual([]);
    expect(db.pendingCalls()).toEqual([]);
  });

  it("loads the audit rows", async () => {
    const db = createFakeDb();
    db.queueRpc("list_api_audit", { data: [ROW] });
    const toast = { push: vi.fn() };
    const hook = renderHook(() =>
      useApiAudit({ client: db.client, toast, enabled: true })
    );

    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.audit).toHaveLength(1);
    expect(hook.result.current.audit[0].canUndo).toBe(true);
  });

  it("undoes a change and refreshes the list", async () => {
    const db = createFakeDb();
    db.queueRpc("list_api_audit", { data: [ROW] });
    const toast = { push: vi.fn() };
    const hook = renderHook(() =>
      useApiAudit({ client: db.client, toast, enabled: true })
    );
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    db.queueRpc("undo_api_update", { data: { id: "note-1", version: 3 } });
    db.queueRpc("list_api_audit", {
      data: [{ ...ROW, can_undo: false }],
    });

    let undone = false;
    await act(async () => {
      undone = await hook.result.current.undo(7);
    });

    expect(undone).toBe(true);
    expect(hook.result.current.audit[0].canUndo).toBe(false);
    expect(toast.push).toHaveBeenCalledWith(
      "External change undone.",
      "success"
    );
  });

  it("reports a load failure", async () => {
    const db = createFakeDb();
    db.queueRpc("list_api_audit", { error: { message: "offline" } });
    const toast = { push: vi.fn() };
    const hook = renderHook(() =>
      useApiAudit({ client: db.client, toast, enabled: true })
    );

    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.error).toBe("offline");
  });

  it("reports an undo failure", async () => {
    const db = createFakeDb();
    db.queueRpc("list_api_audit", { data: [ROW] });
    const toast = { push: vi.fn() };
    const hook = renderHook(() =>
      useApiAudit({ client: db.client, toast, enabled: true })
    );
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    db.queueRpc("undo_api_update", { error: { message: "changed" } });

    let undone = true;
    await act(async () => {
      undone = await hook.result.current.undo(7);
    });

    expect(undone).toBe(false);
    expect(hook.result.current.error).toBe("changed");
    expect(toast.push).toHaveBeenCalledWith("changed", "error");
  });
});
