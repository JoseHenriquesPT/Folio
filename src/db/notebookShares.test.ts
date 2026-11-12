import { describe, expect, it } from "vitest";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import {
  listNotebookShares,
  listVisibleNotebookShares,
  revokeNotebookShare,
  setNotebookSharePermission,
  shareNotebook,
} from "./notebookShares";
import type { NotebookShareRow } from "./database.types";

function share(overrides: Partial<NotebookShareRow> = {}): NotebookShareRow {
  return {
    id: "nb-share-1",
    notebook_id: "nb-1",
    shared_with: "user-2",
    permission: "read",
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("notebook shares data layer", () => {
  it("lists the shares on a notebook", async () => {
    const db = createFakeDb();
    const query = db.queue("notebook_shares", { data: [share()] });

    await expect(listNotebookShares(db.client, "nb-1")).resolves.toEqual([
      share(),
    ]);
    expect(methodCalls(query, "eq")).toEqual([["notebook_id", "nb-1"]]);
    expect(methodCalls(query, "order")).toEqual([
      ["created_at", { ascending: true }],
    ]);
  });

  it("lists every visible share row", async () => {
    const db = createFakeDb();
    db.queue("notebook_shares", {
      data: [share(), share({ id: "nb-share-2", shared_with: "user-3" })],
    });

    await expect(listVisibleNotebookShares(db.client)).resolves.toHaveLength(2);
  });

  it("upserts a share on the notebook/recipient pair", async () => {
    const db = createFakeDb();
    const query = db.queue("notebook_shares", {
      data: share({ permission: "edit" }),
    });

    await expect(
      shareNotebook(db.client, {
        notebookId: "nb-1",
        sharedWith: "user-2",
        permission: "edit",
      })
    ).resolves.toEqual(share({ permission: "edit" }));
    expect(methodCalls(query, "upsert")).toEqual([
      [
        {
          notebook_id: "nb-1",
          shared_with: "user-2",
          permission: "edit",
        },
        { onConflict: "notebook_id,shared_with" },
      ],
    ]);
  });

  it("changes a share permission", async () => {
    const db = createFakeDb();
    const query = db.queue("notebook_shares", {
      data: share({ permission: "edit" }),
    });

    await setNotebookSharePermission(db.client, "nb-share-1", "edit");
    expect(methodCalls(query, "update")).toEqual([[{ permission: "edit" }]]);
    expect(methodCalls(query, "eq")).toEqual([["id", "nb-share-1"]]);
  });

  it("revokes a share", async () => {
    const db = createFakeDb();
    const query = db.queue("notebook_shares", { data: null });

    await revokeNotebookShare(db.client, "nb-share-1");
    expect(query.calls.some((call) => call.method === "delete")).toBe(true);
    expect(methodCalls(query, "eq")).toEqual([["id", "nb-share-1"]]);
  });

  it("throws database errors", async () => {
    const db = createFakeDb();
    db.queue("notebook_shares", { error: { message: "boom" } });

    await expect(listNotebookShares(db.client, "nb-1")).rejects.toMatchObject({
      message: "boom",
    });
  });
});
