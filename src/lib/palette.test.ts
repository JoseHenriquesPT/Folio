import { describe, expect, it } from "vitest";
import {
  applyPalette,
  DEFAULT_PALETTE,
  isPaletteId,
  PALETTES,
  PALETTE_STORAGE_KEY,
  persistPalette,
  readPalette,
} from "./palette";

describe("PALETTES", () => {
  it("lists every palette exactly once with a label", () => {
    const ids = PALETTES.map((palette) => palette.id);
    expect(ids).toEqual(["sage", "sepia", "ocean", "rose", "slate"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const palette of PALETTES) {
      expect(palette.label.length).toBeGreaterThan(0);
    }
  });

  it("defaults to sage", () => {
    expect(DEFAULT_PALETTE).toBe("sage");
  });
});

describe("isPaletteId", () => {
  it("accepts known ids and rejects anything else", () => {
    expect(isPaletteId("sage")).toBe(true);
    expect(isPaletteId("slate")).toBe(true);
    expect(isPaletteId("sepia")).toBe(true);
    expect(isPaletteId("magenta")).toBe(false);
    expect(isPaletteId(null)).toBe(false);
    expect(isPaletteId(undefined)).toBe(false);
    expect(isPaletteId(7)).toBe(false);
  });
});

describe("readPalette", () => {
  it("reads a stored palette", () => {
    const storage = {
      getItem: (key: string) => (key === PALETTE_STORAGE_KEY ? "ocean" : null),
    };
    expect(readPalette(storage)).toBe("ocean");
  });

  it("falls back to the default for missing or invalid values", () => {
    expect(readPalette({ getItem: () => null })).toBe("sage");
    expect(readPalette({ getItem: () => "magenta" })).toBe("sage");
  });

  it("falls back to the default when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readPalette(storage)).toBe("sage");
  });
});

describe("persistPalette", () => {
  it("stores the palette id", () => {
    const writes: [string, string][] = [];
    persistPalette("rose", {
      setItem: (key, value) => {
        writes.push([key, value]);
      },
    });
    expect(writes).toEqual([[PALETTE_STORAGE_KEY, "rose"]]);
  });

  it("ignores storage failures", () => {
    const storage = {
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => persistPalette("rose", storage)).not.toThrow();
  });
});

describe("applyPalette", () => {
  it("sets the palette attribute on the root", () => {
    const root = document.createElement("div");
    applyPalette("ocean", root);
    expect(root.dataset.palette).toBe("ocean");
  });
});
