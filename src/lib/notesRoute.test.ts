import { describe, expect, it } from "vitest";
import { newNoteSearch } from "./notesRoute";

describe("newNoteSearch", () => {
  it("keeps the notebook and sort, dropping view, tag, and search", () => {
    expect(
      newNoteSearch("?view=pinned&tag=tag-1&q=hello&notebook=notebook-1&sort=title")
    ).toBe("?notebook=notebook-1&sort=title");
  });

  it("returns an empty string when nothing is left", () => {
    expect(newNoteSearch("?view=shared&q=hello")).toBe("");
  });

  it("handles an empty search", () => {
    expect(newNoteSearch("")).toBe("");
  });

  it("drops stale auth parameters", () => {
    expect(newNoteSearch("?code=abc&notebook=notebook-1")).toBe(
      "?notebook=notebook-1"
    );
  });
});
