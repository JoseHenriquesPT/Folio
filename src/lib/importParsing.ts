import type { ImportNotebook } from "./importPlan";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

export function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    const key = name.toLowerCase();
    if (name === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(name);
  }

  return tags;
}

export function pathKey(path: string[]): string {
  return path.join("\u0000");
}

export interface NotebookPathTree {
  notebooks: ImportNotebook[];
  byPath: Map<string, string>;
  /** Returns the deepest notebook for a path, creating missing levels. */
  ensure: (parts: string[]) => string | null;
}

/**
 * Both Folio archives describe notebooks as "A / B / C" paths. This turns a
 * path into a tree of rows, reusing levels that already exist so siblings share
 * parents instead of duplicating the chain.
 */
export function notebookPathTree(idPrefix: string): NotebookPathTree {
  const notebooks: ImportNotebook[] = [];
  const byPath = new Map<string, string>();

  function ensure(parts: string[]): string | null {
    const path = parts.map((part) => part.trim()).filter(Boolean);
    if (path.length === 0) return null;

    let parentId: string | null = null;

    for (let length = 1; length <= path.length; length += 1) {
      const prefix = path.slice(0, length);
      const key = pathKey(prefix);
      const known = byPath.get(key);

      if (known) {
        parentId = known;
        continue;
      }

      const id = `${idPrefix}:${key}`;
      notebooks.push({ id, title: prefix[prefix.length - 1], parentId });
      byPath.set(key, id);
      parentId = id;
    }

    return parentId;
  }

  return { notebooks, byPath, ensure };
}
