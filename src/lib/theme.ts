import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "folio.theme";

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return mode;
}

export function readThemeMode(
  storage: Pick<Storage, "getItem"> = localStorage
): ThemeMode {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    return "system";
  }
  return "system";
}

export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement
): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyInitialTheme(root: HTMLElement = document.documentElement): void {
  applyTheme(resolveTheme(readThemeMode(), systemPrefersDark()), root);
}

function persistThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => readThemeMode());
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveTheme(mode, prefersDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  function setMode(next: ThemeMode): void {
    persistThemeMode(next);
    setModeState(next);
  }

  return { mode, resolved, setMode };
}
