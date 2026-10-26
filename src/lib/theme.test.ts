import { describe, expect, it } from "vitest";
import {
  applyTheme,
  readThemeMode,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "./theme";

describe("resolveTheme", () => {
  it("follows the system preference in system mode", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("keeps an explicit mode regardless of the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("readThemeMode", () => {
  it("reads a stored mode", () => {
    const storage = { getItem: (key: string) => (key === THEME_STORAGE_KEY ? "dark" : null) };
    expect(readThemeMode(storage)).toBe("dark");
  });

  it("falls back to system for missing or invalid values", () => {
    expect(readThemeMode({ getItem: () => null })).toBe("system");
    expect(readThemeMode({ getItem: () => "sepia" })).toBe("system");
  });

  it("falls back to system when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readThemeMode(storage)).toBe("system");
  });
});

describe("applyTheme", () => {
  it("sets the theme attribute and color scheme", () => {
    const root = document.createElement("div");
    applyTheme("dark", root);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });
});
