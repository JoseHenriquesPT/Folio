import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyInitialTheme,
  applyTheme,
  readThemeMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  useTheme,
} from "./theme";
import { PALETTE_STORAGE_KEY } from "./palette";

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

interface FakeMedia {
  matches: boolean;
  fire(matches: boolean): void;
}

function installMatchMedia(initial: boolean): FakeMedia {
  let listener: ((event: { matches: boolean }) => void) | null = null;
  const media: FakeMedia = {
    matches: initial,
    fire(matches: boolean) {
      media.matches = matches;
      listener?.({ matches });
    },
  };
  window.matchMedia = ((query: string) => ({
    get matches() {
      return media.matches;
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, next: (event: { matches: boolean }) => void) => {
      listener = next;
    },
    removeEventListener: () => {
      listener = null;
    },
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return media;
}

afterEach(() => {
  localStorage.clear();
});

describe("applyInitialTheme", () => {
  it("applies the stored mode and palette to the root", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    localStorage.setItem(PALETTE_STORAGE_KEY, "sepia");
    const root = document.createElement("div");

    applyInitialTheme(root);

    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.palette).toBe("sepia");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("falls back to system mode and the sage palette", () => {
    const root = document.createElement("div");

    applyInitialTheme(root);

    expect(root.dataset.theme).toBe("light");
    expect(root.dataset.palette).toBe("sage");
  });
});

describe("useTheme", () => {
  it("reads the stored preferences", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    localStorage.setItem(PALETTE_STORAGE_KEY, "ocean");
    applyInitialTheme();

    const { result } = renderHook(() => useTheme());

    expect(result.current.mode).toBe("dark");
    expect(result.current.palette).toBe("ocean");
    expect(result.current.resolved).toBe("dark");
  });

  it("persists and applies palette changes, keeping every instance in sync", () => {
    applyInitialTheme();
    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());

    act(() => first.result.current.setPalette("rose"));

    expect(first.result.current.palette).toBe("rose");
    expect(second.result.current.palette).toBe("rose");
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe("rose");
    expect(document.documentElement.dataset.palette).toBe("rose");
  });

  it("persists mode changes and re-resolves", () => {
    applyInitialTheme();
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setMode("dark"));

    expect(result.current.mode).toBe("dark");
    expect(result.current.resolved).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows system preference changes in system mode", () => {
    const media = installMatchMedia(false);
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    applyInitialTheme();
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe("light");

    act(() => media.fire(true));

    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ignores system preference changes in an explicit mode", () => {
    const media = installMatchMedia(false);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    applyInitialTheme();
    const { result } = renderHook(() => useTheme());

    act(() => media.fire(true));

    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
