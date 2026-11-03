import { describe, expect, it } from "vitest";
import type { NotebookRow } from "../db/database.types";
import {
  buildNotebookTree,
  flattenNotebookTree,
  notebookBreadcrumb,
  notebookDescendantIds,
  notebookDropZone,
  notebookOrderMatches,
  planNotebookDrop,
  visibleNotebookRows,
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

describe("visibleNotebookRows", () => {
  it("keeps a collapsed notebook but hides everything under it", () => {
    const visible = visibleNotebookRows(buildNotebookTree(rows), new Set(["root"]));

    expect(visible.map(({ node, depth }) => [node.id, depth])).toEqual([
      ["root", 0],
      ["other", 0],
    ]);
    expect(visible[0].hasChildren).toBe(true);
    expect(visible[1].hasChildren).toBe(false);
  });

  it("shows the full tree when nothing is collapsed", () => {
    expect(
      visibleNotebookRows(buildNotebookTree(rows), new Set()).map(
        ({ node }) => node.id
      )
    ).toEqual(["root", "sibling", "child", "other"]);
  });
});

describe("notebookDropZone", () => {
  it("uses the top and bottom quarters for reordering and the middle to nest", () => {
    expect(notebookDropZone(10, 0, 40)).toBe("before");
    expect(notebookDropZone(20, 0, 40)).toBe("inside");
    expect(notebookDropZone(35, 0, 40)).toBe("after");
  });
});

describe("planNotebookDrop", () => {
  it("reorders among root notebooks", () => {
    expect(planNotebookDrop(rows, "other", "root", "before")).toEqual({
      parentId: null,
      orderedIds: ["other", "root"],
      label: "before Work",
    });
  });

  it("nests a notebook as the last child of the target", () => {
    expect(planNotebookDrop(rows, "other", "root", "inside")).toEqual({
      parentId: "root",
      orderedIds: ["sibling", "child", "other"],
      label: "inside Work",
    });
  });

  it("places a notebook after a sibling in its own parent", () => {
    expect(planNotebookDrop(rows, "sibling", "child", "after")).toEqual({
      parentId: "root",
      orderedIds: ["child", "sibling"],
      label: "after Projects",
    });
  });

  it("moves a child out to the root", () => {
    expect(planNotebookDrop(rows, "child", "other", "after")).toEqual({
      parentId: null,
      orderedIds: ["root", "other", "child"],
      label: "after Personal",
    });
  });

  it("moves a notebook to the end of the top level", () => {
    expect(planNotebookDrop(rows, "child", null, "inside")).toEqual({
      parentId: null,
      orderedIds: ["root", "other", "child"],
      label: "to the top level",
    });
  });

  it("refuses to drop a notebook on itself or inside its own child", () => {
    expect(planNotebookDrop(rows, "root", "root", "inside")).toBeNull();
    expect(planNotebookDrop(rows, "root", "child", "inside")).toBeNull();
  });

  it("recognises when a plan changes nothing", () => {
    const plan = planNotebookDrop(rows, "other", "root", "before");
    expect(plan).not.toBeNull();
    expect(notebookOrderMatches(rows, plan!)).toBe(false);

    const unchanged = planNotebookDrop(rows, "other", "root", "after");
    expect(unchanged).not.toBeNull();
    expect(notebookOrderMatches(rows, unchanged!)).toBe(true);
  });
});
