import { describe, expect, it } from "vitest";
import { createFakeDb } from "../test/fakeDb";
import { listApiAudit, undoApiUpdate } from "./apiAudit";

const ROW = {
  id: 7,
  tool: "update_note",
  status: "ok",
  note_ids: ["note-1"],
  note_titles: ["Lisbon"],
  summary: { title: "Lisbon", version_from: 1, version_to: 2 },
  token_name: "Owner write",
  token_prefix: "folio_pat_ab12cd",
  created_at: "2026-11-15T12:00:00.000Z",
  can_undo: true,
};

describe("external audit data layer", () => {
  it("lists and maps audit rows", async () => {
    const db = createFakeDb();
    db.queueRpc("list_api_audit", { data: [ROW] });

    await expect(listApiAudit(db.client)).resolves.toEqual([
      {
        id: 7,
        tool: "update_note",
        status: "ok",
        noteIds: ["note-1"],
        noteTitles: ["Lisbon"],
        summary: { title: "Lisbon", version_from: 1, version_to: 2 },
        tokenName: "Owner write",
        tokenPrefix: "folio_pat_ab12cd",
        createdAt: "2026-11-15T12:00:00.000Z",
        canUndo: true,
      },
    ]);
    expect(db.rpc).toHaveBeenCalledWith("list_api_audit", { p_limit: 50 });
  });

  it("forwards a custom limit", async () => {
    const db = createFakeDb();
    db.queueRpc("list_api_audit", { data: [] });

    await listApiAudit(db.client, 10);

    expect(db.rpc).toHaveBeenCalledWith("list_api_audit", { p_limit: 10 });
  });

  it("undoes an update", async () => {
    const db = createFakeDb();
    db.queueRpc("undo_api_update", {
      data: { id: "note-1", version: 3 },
    });

    await expect(undoApiUpdate(db.client, 7)).resolves.toEqual({
      id: "note-1",
      version: 3,
    });
    expect(db.rpc).toHaveBeenCalledWith("undo_api_update", {
      p_audit_id: 7,
    });
  });

  it("throws database errors", async () => {
    const db = createFakeDb();
    db.queueRpc("list_api_audit", { error: { message: "boom" } });

    await expect(listApiAudit(db.client)).rejects.toMatchObject({
      message: "boom",
    });
  });
});
