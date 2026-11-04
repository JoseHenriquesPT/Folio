import { useSyncExternalStore } from "react";
import {
  applyPalette,
  persistPalette,
  readPalette,
  type PaletteId,
} from "./palette";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "folio.theme";

export interface ThemeState {
  mode: ThemeMode;
  palette: PaletteId;
  resolved: ResolvedTheme;
}

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

function persistThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

// One store behind every useTheme() instance, so the sidebar switcher and
// Settings always show the same thing and a change applies exactly once.
let state: ThemeState | null = null;
let mediaCleanup: (() => void) | null = null;
const listeners = new Set<() => void>();

function readStoredState(): ThemeState {
  const mode = readThemeMode();
  const palette = readPalette();
  return { mode, palette, resolved: resolveTheme(mode, systemPrefersDark()) };
}

function commit(next: ThemeState, root: HTMLElement): void {
  state = next;
  applyTheme(next.resolved, root);
  applyPalette(next.palette, root);
  for (const listener of listeners) listener();
}

function currentState(): ThemeState {
  let current = state;
  if (!current) {
    current = readStoredState();
    commit(current, document.documentElement);
  }
  return current;
}

function wireSystemPreference(): void {
  mediaCleanup?.();
  mediaCleanup = null;
  if (typeof window === "undefined" || !window.matchMedia) return;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (event: MediaQueryListEvent) => {
    const current = currentState();
    commit(
      { ...current, resolved: resolveTheme(current.mode, event.matches) },
      document.documentElement
    );
  };
  media.addEventListener("change", onChange);
  mediaCleanup = () => media.removeEventListener("change", onChange);
}

function subscribe(listener: () => void): () => void {
  currentState();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Re-reads the stored preferences and applies them. Called once at startup
 * (before React mounts, so there is no flash) and usable again to re-seed.
 */
export function applyInitialTheme(root: HTMLElement = document.documentElement): void {
  commit(readStoredState(), root);
  wireSystemPreference();
}

export function setThemeMode(mode: ThemeMode): void {
  persistThemeMode(mode);
  const current = currentState();
  commit(
    { ...current, mode, resolved: resolveTheme(mode, systemPrefersDark()) },
    document.documentElement
  );
}

export function setPalette(palette: PaletteId): void {
  persistPalette(palette);
  const current = currentState();
  commit({ ...current, palette }, document.documentElement);
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, currentState, currentState);
  return {
    mode: snapshot.mode,
    resolved: snapshot.resolved,
    palette: snapshot.palette,
    setMode: setThemeMode,
    setPalette: setPalette,
  };
}
