export interface NotebookLike {
  id: string;
  title: string;
  parentId: string | null;
}

const MAX_SEGMENT = 80;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;

export function slugifyFileName(value: string, fallback = "Untitled"): string {
  const cleaned = value
    .replace(ILLEGAL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");

  if (cleaned === "") return fallback;

  const capped =
    cleaned.length > MAX_SEGMENT
      ? cleaned.slice(0, MAX_SEGMENT).replace(/[.\s]+$/, "")
      : cleaned;

  return WINDOWS_DEVICE.test(capped) ? `${capped}_` : capped;
}

export interface NameRequest {
  key: string;
  base: string;
  extension: string;
}

export function uniqueFileNames(requests: NameRequest[]): Map<string, string> {
  const used = new Set<string>();
  const names = new Map<string, string>();

  for (const request of requests) {
    const suffix = request.extension ? `.${request.extension}` : "";
    let candidate = `${request.base}${suffix}`;
    let counter = 2;

    while (used.has(candidate.toLowerCase())) {
      candidate = `${request.base}-${counter}${suffix}`;
      counter += 1;
    }

    used.add(candidate.toLowerCase());
    names.set(request.key, candidate);
  }

  return names;
}

function depthOf(notebooks: Map<string, NotebookLike>, id: string): number {
  const seen = new Set<string>();
  let depth = 0;
  let current = notebooks.get(id);

  while (current?.parentId && notebooks.has(current.parentId)) {
    if (seen.has(current.id) || depth > notebooks.size) break;
    seen.add(current.id);
    depth += 1;
    current = notebooks.get(current.parentId);
  }

  return depth;
}

export function notebookFolders(
  notebooks: NotebookLike[]
): Map<string, string[]> {
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const ordered = [...notebooks].sort((left, right) => {
    const depth = depthOf(byId, left.id) - depthOf(byId, right.id);
    if (depth !== 0) return depth;
    return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
  });

  const folders = new Map<string, string[]>();
  const siblings = new Map<string, string[]>();

  for (const notebook of ordered) {
    const parentId =
      notebook.parentId && byId.has(notebook.parentId) && notebook.parentId !== notebook.id
        ? notebook.parentId
        : null;

    const group = parentId ?? "";
    const used = siblings.get(group) ?? [];
    const base = slugifyFileName(notebook.title, "Notebook");
    let name = base;
    let counter = 2;

    while (used.some((taken) => taken.toLowerCase() === name.toLowerCase())) {
      name = `${base}-${counter}`;
      counter += 1;
    }

    used.push(name);
    siblings.set(group, used);

    const parentPath = parentId ? (folders.get(parentId) ?? []) : [];
    folders.set(notebook.id, [...parentPath, name]);
  }

  return folders;
}
