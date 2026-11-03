import { useCallback, useState } from "react";

export const COLLAPSED_NOTEBOOKS_KEY = "folio.collapsedNotebooks";

export function readCollapsed(
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined"
    ? null
    : localStorage
): Set<string> {
  if (!storage) return new Set();

  try {
    const raw = storage.getItem(COLLAPSED_NOTEBOOKS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function toggleCollapsed(
  current: ReadonlySet<string>,
  notebookId: string
): Set<string> {
  const next = new Set(current);
  if (next.has(notebookId)) next.delete(notebookId);
  else next.add(notebookId);
  return next;
}

function persist(collapsed: ReadonlySet<string>): void {
  try {
    localStorage.setItem(COLLAPSED_NOTEBOOKS_KEY, JSON.stringify([...collapsed]));
  } catch {
    /* Storage can be unavailable in private mode; collapse still works in memory. */
  }
}

/** Collapsed notebooks survive reloads; the sidebar is a working surface. */
export function useNotebookCollapse() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed());

  const toggle = useCallback((notebookId: string) => {
    setCollapsed((current) => {
      const next = toggleCollapsed(current, notebookId);
      persist(next);
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
