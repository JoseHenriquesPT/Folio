import { describe, expect, it } from "vitest";
import { notebookBadges } from "./notebookShares";
import type { NotebookRow, NotebookShareRow } from "../db/database.types";

function notebook(overrides: Partial<NotebookRow> = {}): NotebookRow {
  return {
    id: "nb-1",
    owner_id: "user-1",
    parent_id: null,
    name: "Writing",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

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

describe("notebookBadges", () => {
  it("marks an owned notebook shared with one person", () => {
    const badges = notebookBadges(
      [notebook()],
      [share()],
      "user-1",
      new Map()
    );

    expect(badges.get("nb-1")).toEqual({
      label: "Shared",
      title: "Shared with 1 person, including its sub-notebooks.",
    });
  });

  it("counts multiple recipients on an owned notebook", () => {
    const badges = notebookBadges(
      [notebook()],
      [share(), share({ id: "nb-share-2", shared_with: "user-3" })],
      "user-1",
      new Map()
    );

    expect(badges.get("nb-1")?.label).toBe("Shared · 2");
  });

  it("leaves an unshared owned notebook unmarked", () => {
    const badges = notebookBadges([notebook()], [], "user-1", new Map());
    expect(badges.has("nb-1")).toBe(false);
  });

  it("marks a notebook shared with me with the owner's name", () => {
    const badges = notebookBadges(
      [notebook({ owner_id: "user-1" })],
      [share({ shared_with: "user-2", permission: "edit" })],
      "user-2",
      new Map([["user-1", "Alice"]])
    );

    expect(badges.get("nb-1")).toEqual({
      label: "Shared",
      title: "Shared by Alice · Can edit.",
    });
  });

  it("falls back to the owner wording when the name is unknown", () => {
    const badges = notebookBadges(
      [notebook({ owner_id: "user-1" })],
      [share({ shared_with: "user-2" })],
      "user-2",
      new Map()
    );

    expect(badges.get("nb-1")?.title).toBe("Shared by the owner · Read only.");
  });

  it("badges only the subtree root, not its children", () => {
    const badges = notebookBadges(
      [notebook(), notebook({ id: "nb-2", parent_id: "nb-1" })],
      [share()],
      "user-1",
      new Map()
    );

    expect(badges.has("nb-1")).toBe(true);
    expect(badges.has("nb-2")).toBe(false);
  });

  it("does not mark someone else's notebook that was not shared with me", () => {
    const badges = notebookBadges(
      [notebook({ owner_id: "user-1" })],
      [share({ shared_with: "user-3" })],
      "user-2",
      new Map()
    );

    expect(badges.has("nb-1")).toBe(false);
  });
});
