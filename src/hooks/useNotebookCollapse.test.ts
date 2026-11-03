import { describe, expect, it } from "vitest";
import { readCollapsed, toggleCollapsed } from "./useNotebookCollapse";

describe("notebook collapse state", () => {
  it("toggles one notebook without touching the rest", () => {
    const first = toggleCollapsed(new Set(["a"]), "b");
    expect([...first].sort()).toEqual(["a", "b"]);

    const second = toggleCollapsed(first, "a");
    expect([...second]).toEqual(["b"]);
  });

  it("reads a saved array and ignores anything malformed", () => {
    const storage = {
      getItem: (key: string) =>
        key === "folio.collapsedNotebooks" ? '["a","b"]' : null,
    };
    expect([...readCollapsed(storage)].sort()).toEqual(["a", "b"]);

    expect(
      readCollapsed({ getItem: () => '{"not":"an array"}' }).size
    ).toBe(0);
    expect(readCollapsed({ getItem: () => "not json" }).size).toBe(0);
  });
});
