import { describe, expect, it } from "vitest";
import { notebookFolders, slugifyFileName, uniqueFileNames } from "./exportPaths";

describe("slugifyFileName", () => {
  it("keeps readable titles", () => {
    expect(slugifyFileName("Card Games")).toBe("Card Games");
    expect(slugifyFileName("2026-09-07 notes")).toBe("2026-09-07 notes");
  });

  it("drops characters that break file systems or zip readers", () => {
    expect(slugifyFileName('Deploy: "prod" #2')).toBe("Deploy prod #2");
    expect(slugifyFileName("a/b\\c|d?e*f<g>h")).toBe("a b c d e f g h");
    expect(slugifyFileName("tab\there\u0000null")).toBe("tab here null");
  });

  it("collapses whitespace and trims dots", () => {
    expect(slugifyFileName("  lots   of   space  ")).toBe("lots of space");
    expect(slugifyFileName("note...")).toBe("note");
    expect(slugifyFileName("...")).toBe("Untitled");
  });

  it("falls back for empty titles", () => {
    expect(slugifyFileName("")).toBe("Untitled");
    expect(slugifyFileName("   ", "Note")).toBe("Note");
  });

  it("avoids Windows device names", () => {
    expect(slugifyFileName("CON")).toBe("CON_");
    expect(slugifyFileName("lpt1")).toBe("lpt1_");
  });

  it("caps very long titles", () => {
    const slug = slugifyFileName("word ".repeat(40));

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith(" ")).toBe(false);
  });
});

describe("uniqueFileNames", () => {
  it("suffixes duplicates and keeps extensions", () => {
    const names = uniqueFileNames([
      { key: "a", base: "Note", extension: "md" },
      { key: "b", base: "Note", extension: "md" },
      { key: "c", base: "note", extension: "md" },
      { key: "d", base: "Note", extension: "html" },
    ]);

    expect(names.get("a")).toBe("Note.md");
    expect(names.get("b")).toBe("Note-2.md");
    expect(names.get("c")).toBe("note-3.md");
    expect(names.get("d")).toBe("Note.html");
  });

  it("does not reuse a suffix already taken", () => {
    const names = uniqueFileNames([
      { key: "a", base: "Note", extension: "md" },
      { key: "b", base: "Note", extension: "md" },
      { key: "c", base: "Note-2", extension: "md" },
    ]);

    expect(names.get("a")).toBe("Note.md");
    expect(names.get("b")).toBe("Note-2.md");
    expect(names.get("c")).toBe("Note-2-2.md");
  });
});

describe("notebookFolders", () => {
  it("builds nested paths", () => {
    const folders = notebookFolders([
      { id: "p", title: "Projects", parentId: null },
      { id: "w", title: "Web", parentId: "p" },
      { id: "i", title: "Ideas", parentId: null },
    ]);

    expect(folders.get("p")).toEqual(["Projects"]);
    expect(folders.get("w")).toEqual(["Projects", "Web"]);
    expect(folders.get("i")).toEqual(["Ideas"]);
  });

  it("sanitises folder names", () => {
    const folders = notebookFolders([
      { id: "a", title: "Tasks: shopping", parentId: null },
    ]);

    expect(folders.get("a")).toEqual(["Tasks shopping"]);
  });

  it("suffixes sibling notebooks with the same name", () => {
    const folders = notebookFolders([
      { id: "a", title: "Notes", parentId: null },
      { id: "b", title: "Notes", parentId: null },
    ]);

    expect(folders.get("a")).toEqual(["Notes"]);
    expect(folders.get("b")).toEqual(["Notes-2"]);
  });

  it("treats a missing parent as a root notebook", () => {
    const folders = notebookFolders([
      { id: "a", title: "Orphan", parentId: "missing" },
    ]);

    expect(folders.get("a")).toEqual(["Orphan"]);
  });

  it("does not hang on a cycle", () => {
    const folders = notebookFolders([
      { id: "a", title: "A", parentId: "b" },
      { id: "b", title: "B", parentId: "a" },
    ]);

    expect(folders.get("a")?.length).toBeGreaterThan(0);
    expect(folders.get("b")?.length).toBeGreaterThan(0);
  });
});
