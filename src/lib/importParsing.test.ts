import { describe, expect, it } from "vitest";
import {
  asString,
  asTimestamp,
  cleanTags,
  isRecord,
  notebookPathTree,
} from "./importParsing";

describe("importParsing guards", () => {
  it("accepts plain objects and strings only", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(asString("x")).toBe("x");
    expect(asString(1)).toBeNull();
  });

  it("keeps parseable timestamps and drops empty or invalid ones", () => {
    expect(asTimestamp("2026-01-01T00:00:00.000Z")).toBe(
      "2026-01-01T00:00:00.000Z"
    );
    expect(asTimestamp("")).toBeNull();
    expect(asTimestamp("not a date")).toBeNull();
    expect(asTimestamp(42)).toBeNull();
  });

  it("trims, de-duplicates case-insensitively, and ignores non-strings", () => {
    expect(cleanTags([" Home ", "home", "", 3, "Work"])).toEqual([
      "Home",
      "Work",
    ]);
    expect(cleanTags("Home")).toEqual([]);
  });
});

describe("notebookPathTree", () => {
  it("creates every level once and shares parents between siblings", () => {
    const tree = notebookPathTree("path");

    const web = tree.ensure(["Projects", "Web"]);
    const mobile = tree.ensure(["Projects", "Mobile"]);

    expect(tree.notebooks).toEqual([
      { id: "path:Projects", title: "Projects", parentId: null },
      { id: "path:Projects\u0000Web", title: "Web", parentId: "path:Projects" },
      {
        id: "path:Projects\u0000Mobile",
        title: "Mobile",
        parentId: "path:Projects",
      },
    ]);
    expect(web).toBe("path:Projects\u0000Web");
    expect(mobile).toBe("path:Projects\u0000Mobile");
  });

  it("reuses a level that was seeded before the first ensure", () => {
    const tree = notebookPathTree("path");
    tree.byPath.set(["Ideas"].join("\u0000"), "kept");
    tree.notebooks.push({ id: "kept", title: "Ideas", parentId: null });

    expect(tree.ensure(["Ideas", "Recipes"])).toBe(
      "path:Ideas\u0000Recipes"
    );
    expect(tree.notebooks).toHaveLength(2);
  });

  it("returns null for an empty path", () => {
    const tree = notebookPathTree("path");

    expect(tree.ensure(["", " "])).toBeNull();
    expect(tree.notebooks).toEqual([]);
  });
});
