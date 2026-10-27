import { describe, expect, it } from "vitest";
import { planSearch, sanitizeShortTerm } from "./search";

describe("planSearch", () => {
  it("returns null for empty input", () => {
    expect(planSearch(undefined)).toBeNull();
    expect(planSearch("   ")).toBeNull();
  });

  it("uses full-text search for three or more characters", () => {
    expect(planSearch("garden tools")).toEqual({
      kind: "fts",
      term: "garden tools",
    });
    expect(planSearch("abc")).toEqual({ kind: "fts", term: "abc" });
  });

  it("uses a like fallback for very short terms", () => {
    expect(planSearch("ga")).toEqual({ kind: "like", pattern: "%ga%" });
  });

  it("strips wildcard syntax from short terms", () => {
    expect(planSearch("5%")).toEqual({ kind: "like", pattern: "%5%" });
    expect(planSearch("_a")).toEqual({ kind: "like", pattern: "%a%" });
  });

  it("returns null when a short term has nothing searchable", () => {
    expect(planSearch("%%")).toBeNull();
    expect(planSearch("_%")).toBeNull();
  });
});

describe("sanitizeShortTerm", () => {
  it("removes PostgREST separators and collapses spaces", () => {
    expect(sanitizeShortTerm("a,b (c)  d")).toBe("a b c d");
  });

  it("trims and removes backslashes", () => {
    expect(sanitizeShortTerm("  a\\b  ")).toBe("ab");
  });
});
