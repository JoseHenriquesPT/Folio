export interface WorkspaceLocation {
  pathname: string;
  search: string;
}

const STORAGE_PREFIX = "folio.lastLocation";
const WORKSPACE_PATHS = new Set(["/", "/shared", "/archived", "/trash"]);
const LOCATION_PARAMS = ["view", "notebook", "tag", "q", "sort", "dir"];

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "getItem" | "setItem">;

function local(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function lastLocationKey(userId: string): string {
  return `${STORAGE_PREFIX}.${userId}`;
}

function isNotePath(pathname: string): boolean {
  if (!pathname.startsWith("/note/")) return false;
  const id = pathname.slice("/note/".length);
  return id.length > 0 && id !== "new" && !id.includes("/");
}

/** Screens worth reopening: the workspace lists and a real note, never drafts or Settings. */
export function isWorkspacePath(pathname: string): boolean {
  return WORKSPACE_PATHS.has(pathname) || isNotePath(pathname);
}

/** Keep only the list context the workspace understands. */
export function workspaceSearch(search: string): string {
  const current = new URLSearchParams(search);
  const next = new URLSearchParams();
  for (const key of LOCATION_PARAMS) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  const text = next.toString();
  return text ? `?${text}` : "";
}

export function readLastLocation(
  userId: string,
  storage: ReadStorage | null = local()
): WorkspaceLocation | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(lastLocationKey(userId));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const { pathname, search } = parsed as {
      pathname?: unknown;
      search?: unknown;
    };
    if (typeof pathname !== "string" || typeof search !== "string") {
      return null;
    }
    if (!isWorkspacePath(pathname)) return null;

    return { pathname, search: workspaceSearch(search) };
  } catch {
    return null;
  }
}

export function rememberLastLocation(
  userId: string,
  location: WorkspaceLocation,
  storage: WriteStorage | null = local()
): void {
  if (!storage || !isWorkspacePath(location.pathname)) return;

  try {
    storage.setItem(
      lastLocationKey(userId),
      JSON.stringify({
        pathname: location.pathname,
        search: workspaceSearch(location.search),
      })
    );
  } catch {
    /* Storage can be unavailable in private mode; the app still works. */
  }
}

/**
 * The stored screen is only a launch target when the app opens at a bare `/`.
 * Explicit links (`/shared`, `/?view=pinned`, a note URL) and an empty history
 * are left alone, and a stored root is not worth a navigation.
 */
export function restoreTarget(
  current: WorkspaceLocation,
  stored: WorkspaceLocation | null
): WorkspaceLocation | null {
  if (!stored) return null;
  if (current.pathname !== "/" || current.search !== "") return null;
  if (stored.pathname === "/" && stored.search === "") return null;
  return stored;
}
