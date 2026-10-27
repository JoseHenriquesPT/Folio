import { describe, expect, it } from "vitest";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import {
  attachTag,
  createTag,
  deleteTag,
  detachTag,
  listNoteTags,
  listTagsWithCounts,
  renameTag,
} from "./tags";
import type { TagRow } from "./database.types";

function tag(overrides: Partial<TagRow> = {}): TagRow {
  return {
    id: "tag-1",
    owner_id: "user-1",
    name: "Design",
    color: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("tags data layer", () => {
  it("lists tags with note counts", async () => {
    const db = createFakeDb();
    const query = db.queue("tag_summaries", {
      data: [{ ...tag(), note_count: 3 }],
    });

    await expect(listTagsWithCounts(db.client)).resolves.toEqual([
      { ...tag(), note_count: 3 },
    ]);
    expect(methodCalls(query, "order")).toEqual([["name", { ascending: true }]]);
  });

  it("creates a tag", async () => {
    const db = createFakeDb();
    const query = db.queue("tags", { data: tag() });

    await expect(createTag(db.client, { name: "Design" })).resolves.toEqual(tag());
    expect(methodCalls(query, "insert")).toEqual([
      [{ name: "Design", color: null }],
    ]);
  });

  it("renames a tag", async () => {
    const db = createFakeDb();
    const query = db.queue("tags", { data: tag({ name: "Product" }) });

    await renameTag(db.client, "tag-1", "Product");
    expect(methodCalls(query, "update")).toEqual([[{ name: "Product" }]]);
    expect(methodCalls(query, "eq")).toEqual([["id", "tag-1"]]);
  });

  it("deletes a tag", async () => {
    const db = createFakeDb();
    const query = db.queue("tags", { data: null });

    await deleteTag(db.client, "tag-1");
    expect(query.calls.some((call) => call.method === "delete")).toBe(true);
    expect(methodCalls(query, "eq")).toEqual([["id", "tag-1"]]);
  });

  it("attaches a tag to a note", async () => {
    const db = createFakeDb();
    const query = db.queue("note_tags", { data: null });

    await attachTag(db.client, "note-1", "tag-1");
    expect(methodCalls(query, "insert")).toEqual([
      [{ note_id: "note-1", tag_id: "tag-1" }],
    ]);
  });

  it("detaches a tag from a note", async () => {
    const db = createFakeDb();
    const query = db.queue("note_tags", { data: null });

    await detachTag(db.client, "note-1", "tag-1");
    expect(query.calls.some((call) => call.method === "delete")).toBe(true);
    expect(methodCalls(query, "eq")).toEqual([
      ["note_id", "note-1"],
      ["tag_id", "tag-1"],
    ]);
  });

  it("loads the tags attached to a note", async () => {
    const db = createFakeDb();
    const links = db.queue("note_tags", { data: [{ tag_id: "tag-1" }] });
    const tags = db.queue("tags", { data: [tag()] });

    await expect(listNoteTags(db.client, "note-1")).resolves.toEqual([tag()]);
    expect(methodCalls(links, "eq")).toEqual([["note_id", "note-1"]]);
    expect(methodCalls(tags, "in")).toEqual([["id", ["tag-1"]]]);
    expect(db.pendingCalls()).toEqual([]);
  });

  it("skips the tag query when a note has no tags", async () => {
    const db = createFakeDb();
    db.queue("note_tags", { data: [] });

    await expect(listNoteTags(db.client, "note-1")).resolves.toEqual([]);
    expect(db.pendingCalls()).toEqual([]);
  });

  it("throws database errors", async () => {
    const db = createFakeDb();
    db.queue("tag_summaries", { error: { message: "boom" } });

    await expect(listTagsWithCounts(db.client)).rejects.toMatchObject({
      message: "boom",
    });
  });
});
