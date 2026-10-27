import { useCallback, useState } from "react";

export type NoteViewMode = "cards" | "list";

const STORAGE_KEY = "folio.viewMode";

function readMode(): NoteViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

export function useViewMode() {
  const [mode, setModeState] = useState<NoteViewMode>(readMode);

  const setMode = useCallback((next: NoteViewMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Storage can be unavailable in private mode; the in-memory choice wins. */
    }
  }, []);

  return { mode, setMode };
}
