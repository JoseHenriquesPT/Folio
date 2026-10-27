import { describe, expect, it } from "vitest";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import {
  createNotebook,
  deleteNotebook,
  listNotebooks,
  moveNotebook,
  renameNotebook,
  reorderNotebook,
} from "./notebooks";
import type { NotebookRow } from "./database.types";

function notebook(overrides: Partial<NotebookRow> = {}): NotebookRow {
  return {
    id: "notebook-1",
    owner_id: "user-1",
    parent_id: null,
    name: "Work",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("notebooks data layer", () => {
  it("lists notebooks in manual order", async () => {
    const db = createFakeDb();
    const query = db.queue("notebooks", { data: [notebook()] });

    await expect(listNotebooks(db.client)).resolves.toEqual([notebook()]);
    expect(methodCalls(query, "order")).toEqual([
      ["position", { ascending: true }],
      ["name", { ascending: true }],
      ["created_at", { ascending: true }],
    ]);
  });

  it("creates a notebook without trusting a client owner id", async () => {
    const db = createFakeDb();
    const query = db.queue("notebooks", { data: notebook() });

    await expect(
      createNotebook(db.client, { name: "Work", parentId: "parent-1", position: 2 })
    ).resolves.toEqual(notebook());
    expect(methodCalls(query, "insert")).toEqual([
      [{ name: "Work", parent_id: "parent-1", position: 2 }],
    ]);
  });

  it("defaults new notebooks to root and position zero", async () => {
    const db = createFakeDb();
    const query = db.queue("notebooks", { data: notebook() });

    await createNotebook(db.client, { name: "Work" });
    expect(methodCalls(query, "insert")).toEqual([
      [{ name: "Work", parent_id: null, position: 0 }],
    ]);
  });

  it("renames a notebook", async () => {
    const db = createFakeDb();
    const query = db.queue("notebooks", {
      data: notebook({ name: "Projects" }),
    });

    await expect(renameNotebook(db.client, "notebook-1", "Projects")).resolves.toEqual(
      notebook({ name: "Projects" })
    );
    expect(methodCalls(query, "update")).toEqual([[{ name: "Projects" }]]);
    expect(methodCalls(query, "eq")).toEqual([["id", "notebook-1"]]);
  });

  it("moves a notebook under another parent", async () => {
    const db = createFakeDb();
    const query = db.queue("notebooks", {
      data: notebook({ parent_id: "parent-1" }),
    });

    await moveNotebook(db.client, "notebook-1", "parent-1");
    expect(methodCalls(query, "update")).toEqual([[{ parent_id: "parent-1" }]]);
  });

  it("reorders a notebook", async () => {
    const db = createFakeDb();
    const query = db.queue("notebooks", { data: notebook({ position: 5 }) });

    await reorderNotebook(db.client, "notebook-1", 5);
    expect(methodCalls(query, "update")).toEqual([[{ position: 5 }]]);
  });

  it("deletes a notebook by id", async () => {
    const db = createFakeDb();
    const query = db.queue("notebooks", { data: null });

    await deleteNotebook(db.client, "notebook-1");
    expect(query.calls.some((call) => call.method === "delete")).toBe(true);
    expect(methodCalls(query, "eq")).toEqual([["id", "notebook-1"]]);
  });

  it("throws database errors", async () => {
    const db = createFakeDb();
    db.queue("notebooks", { error: { message: "boom" } });

    await expect(listNotebooks(db.client)).rejects.toMatchObject({
      message: "boom",
    });
  });
});
