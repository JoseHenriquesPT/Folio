import { describe, expect, it } from "vitest";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import {
  getSharePermission,
  listShares,
  revokeShare,
  setSharePermission,
  shareNote,
} from "./shares";
import type { NoteShareRow } from "./database.types";

function share(overrides: Partial<NoteShareRow> = {}): NoteShareRow {
  return {
    id: "share-1",
    note_id: "note-1",
    shared_with: "user-2",
    permission: "read",
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("shares data layer", () => {
  it("lists the shares on a note", async () => {
    const db = createFakeDb();
    const query = db.queue("note_shares", { data: [share()] });

    await expect(listShares(db.client, "note-1")).resolves.toEqual([share()]);
    expect(methodCalls(query, "eq")).toEqual([["note_id", "note-1"]]);
    expect(methodCalls(query, "order")).toEqual([
      ["created_at", { ascending: true }],
    ]);
  });

  it("reads the signed-in user's permission", async () => {
    const db = createFakeDb();
    const query = db.queue("note_shares", { data: { permission: "edit" } });

    await expect(
      getSharePermission(db.client, "note-1", "user-2")
    ).resolves.toBe("edit");
    expect(methodCalls(query, "eq")).toEqual([
      ["note_id", "note-1"],
      ["shared_with", "user-2"],
    ]);
  });

  it("returns null when the user has no share", async () => {
    const db = createFakeDb();
    db.queue("note_shares", { data: null });

    await expect(
      getSharePermission(db.client, "note-1", "user-2")
    ).resolves.toBeNull();
  });

  it("upserts a share on the note/recipient pair", async () => {
    const db = createFakeDb();
    const query = db.queue("note_shares", {
      data: share({ permission: "edit" }),
    });

    await expect(
      shareNote(db.client, {
        noteId: "note-1",
        sharedWith: "user-2",
        permission: "edit",
      })
    ).resolves.toEqual(share({ permission: "edit" }));
    expect(methodCalls(query, "upsert")).toEqual([
      [
        {
          note_id: "note-1",
          shared_with: "user-2",
          permission: "edit",
        },
        { onConflict: "note_id,shared_with" },
      ],
    ]);
  });

  it("changes a share permission", async () => {
    const db = createFakeDb();
    const query = db.queue("note_shares", {
      data: share({ permission: "edit" }),
    });

    await setSharePermission(db.client, "share-1", "edit");
    expect(methodCalls(query, "update")).toEqual([[{ permission: "edit" }]]);
    expect(methodCalls(query, "eq")).toEqual([["id", "share-1"]]);
  });

  it("revokes a share", async () => {
    const db = createFakeDb();
    const query = db.queue("note_shares", { data: null });

    await revokeShare(db.client, "share-1");
    expect(query.calls.some((call) => call.method === "delete")).toBe(true);
    expect(methodCalls(query, "eq")).toEqual([["id", "share-1"]]);
  });

  it("throws database errors", async () => {
    const db = createFakeDb();
    db.queue("note_shares", { error: { message: "boom" } });

    await expect(listShares(db.client, "note-1")).rejects.toMatchObject({
      message: "boom",
    });
  });
});
