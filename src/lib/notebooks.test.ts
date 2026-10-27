import { describe, expect, it } from "vitest";
import type { NotebookRow } from "../db/database.types";
import {
  buildNotebookTree,
  flattenNotebookTree,
  notebookBreadcrumb,
  notebookDescendantIds,
} from "./notebooks";

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

const rows = [
  notebook({ id: "child", name: "Projects", parent_id: "root", position: 1 }),
  notebook({ id: "root", name: "Work", position: 0 }),
  notebook({ id: "sibling", name: "Archive", parent_id: "root", position: 0 }),
  notebook({ id: "other", name: "Personal", position: 1 }),
];

describe("buildNotebookTree", () => {
  it("nests children and sorts by position then name", () => {
    const tree = buildNotebookTree(rows);

    expect(tree.map((node) => node.id)).toEqual(["root", "other"]);
    expect(tree[0].children.map((node) => node.id)).toEqual([
      "sibling",
      "child",
    ]);
  });

  it("treats a missing parent as a root", () => {
    const tree = buildNotebookTree([
      notebook({ id: "orphan", parent_id: "missing" }),
    ]);
    expect(tree.map((node) => node.id)).toEqual(["orphan"]);
  });

  it("does not loop on corrupt cycles", () => {
    const tree = buildNotebookTree([
      notebook({ id: "a", parent_id: "b" }),
      notebook({ id: "b", parent_id: "a" }),
    ]);
    expect(tree).toHaveLength(1);
  });
});

describe("notebookDescendantIds", () => {
  it("returns the notebook and all descendants", () => {
    expect(notebookDescendantIds(rows, "root")).toEqual(
      new Set(["root", "child", "sibling"])
    );
  });

  it("returns an empty set for an unknown notebook", () => {
    expect(notebookDescendantIds(rows, "missing")).toEqual(new Set());
  });
});

describe("notebookBreadcrumb", () => {
  it("returns the path from root to the notebook", () => {
    expect(notebookBreadcrumb(rows, "child").map((n) => n.name)).toEqual([
      "Work",
      "Projects",
    ]);
  });

  it("returns an empty path for an unknown notebook", () => {
    expect(notebookBreadcrumb(rows, "missing")).toEqual([]);
  });
});

describe("flattenNotebookTree", () => {
  it("returns depth-first rows with depth", () => {
    expect(
      flattenNotebookTree(buildNotebookTree(rows)).map(({ node, depth }) => [
        node.id,
        depth,
      ])
    ).toEqual([
      ["root", 0],
      ["sibling", 1],
      ["child", 1],
      ["other", 0],
    ]);
  });
});
