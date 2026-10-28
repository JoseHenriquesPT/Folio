import { markdownToHtml } from "./markdown";
import { sanitizeHtml } from "./sanitize";
import type { TarEntry } from "./tar";

const HEX_ID = /^[0-9a-f]{32}$/;
const METADATA_LINE = /^([A-Za-z0-9_]+):\s?(.*)$/;
const NOTE_ID_LINE = /^id:\s*([0-9a-f]{32})\s*$/;
const TYPE_LINE = /^type_:\s*([0-9]+)\s*$/;

const MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  md: "text/markdown",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  svg: "image/svg+xml",
  txt: "text/plain",
  wav: "audio/wav",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

export interface JoplinNotebook {
  id: string;
  title: string;
  parentId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface JoplinNote {
  id: string;
  title: string;
  bodyHtml: string;
  notebookId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  resourceIds: string[];
}

export interface JoplinResource {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface JoplinSkip {
  path: string;
  reason: string;
}

export interface JoplinImportPlan {
  notebooks: JoplinNotebook[];
  notes: JoplinNote[];
  resources: JoplinResource[];
  skipped: JoplinSkip[];
  warnings: string[];
  counts: {
    notes: number;
    notebooks: number;
    resources: number;
    skipped: number;
    /** Resource links that were rewritten into working attachment refs. */
    rewrittenLinks: number;
  };
}

interface ParsedItem {
  path: string;
  metadata: Record<string, string>;
  title: string;
  body: string;
}

function parseItem(path: string, text: string): ParsedItem | null {
  const lines = text.split(/\r?\n/);

  let typeIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (TYPE_LINE.test(lines[index])) {
      typeIndex = index;
      break;
    }
  }
  if (typeIndex === -1) return null;

  let idIndex = -1;
  for (let index = typeIndex; index >= 0; index -= 1) {
    if (NOTE_ID_LINE.test(lines[index])) {
      idIndex = index;
      break;
    }
  }
  if (idIndex === -1) return null;

  const metadata: Record<string, string> = {};
  for (let index = idIndex; index <= typeIndex; index += 1) {
    const line = lines[index];
    if (line.trim() === "") continue;
    const match = METADATA_LINE.exec(line);
    if (!match) return null;
    metadata[match[1]] = match[2].trim();
  }

  const content = lines.slice(0, idIndex);
  const title = (content.shift() ?? "").trim();
  while (content.length > 0 && content[0].trim() === "") content.shift();

  return {
    path,
    metadata,
    title,
    body: content.join("\n").replace(/\s+$/, ""),
  };
}

function fileExtension(path: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(path);
  return match ? match[1].toLowerCase() : "";
}

function baseName(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.[^.]+$/, "");
}

function timestamp(value: string | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function resourceName(
  metadata: Record<string, string>,
  id: string,
  binaryPath: string | null,
  title: string
): string {
  const declared = metadata.filename?.trim();
  if (declared) return declared;

  if (binaryPath) {
    const name = binaryPath.split("/").pop();
    if (name) return name;
  }

  const fallback = title.trim();
  if (fallback && fallback !== id) return fallback;

  return id;
}

export function planJoplinImport(entries: TarEntry[]): JoplinImportPlan {
  const skipped: JoplinSkip[] = [];
  const warnings = new Set<string>();
  const binaries = new Map<string, Uint8Array>();
  const binaryPaths = new Map<string, string>();

  for (const entry of entries) {
    if (entry.path.startsWith("resources/")) {
      const id = baseName(entry.path);
      binaries.set(id, entry.bytes);
      binaryPaths.set(id, entry.path);
    }
  }

  const items: ParsedItem[] = [];
  for (const entry of entries) {
    if (!entry.path.endsWith(".md")) {
      if (!entry.path.startsWith("resources/")) {
        skipped.push({ path: entry.path, reason: "Not a Joplin item or attachment" });
      }
      continue;
    }

    const text = new TextDecoder().decode(entry.bytes);
    const item = parseItem(entry.path, text);
    if (!item) {
      skipped.push({ path: entry.path, reason: "Missing Joplin metadata" });
      continue;
    }
    items.push(item);
  }

  const notebooks: JoplinNotebook[] = [];
  const noteItems: ParsedItem[] = [];
  const resourceItems: ParsedItem[] = [];

  for (const item of items) {
    const type = item.metadata.type_;
    if (type === "2") {
      if (Number(item.metadata.deleted_time ?? 0) > 0) {
        skipped.push({ path: item.path, reason: "Trashed in Joplin" });
        continue;
      }
      notebooks.push({
        id: item.metadata.id,
        title: item.title,
        parentId: HEX_ID.test(item.metadata.parent_id ?? "")
          ? item.metadata.parent_id
          : null,
        createdAt: timestamp(item.metadata.created_time),
        updatedAt: timestamp(item.metadata.updated_time),
      });
    } else if (type === "1") {
      noteItems.push(item);
    } else if (type === "4") {
      resourceItems.push(item);
    } else {
      skipped.push({ path: item.path, reason: "Unsupported Joplin item type" });
    }
  }

  const resources: JoplinResource[] = [];
  const resourceById = new Map<string, JoplinResource>();

  for (const item of resourceItems) {
    const id = item.metadata.id;
    const bytes = binaries.get(id);

    if (!bytes) {
      skipped.push({
        path: `resources/${resourceName(item.metadata, id, null, item.title)}`,
        reason: "Attachment is missing from the export",
      });
      continue;
    }

    const fileName = resourceName(item.metadata, id, binaryPaths.get(id) ?? null, item.title);

    const resource: JoplinResource = {
      id,
      fileName,
      mimeType:
        item.metadata.mime?.trim() ||
        MIME_BY_EXTENSION[fileExtension(fileName)] ||
        "application/octet-stream",
      bytes,
    };

    resources.push(resource);
    resourceById.set(id, resource);
  }

  const knownNotes = new Set(
    noteItems
      .filter((item) => Number(item.metadata.deleted_time ?? 0) === 0)
      .map((item) => item.metadata.id)
  );

  let rewrittenLinks = 0;

  function rewrite(body: string): string {
    let output = body
      .replace(/!\[([^\]]*)\]\(:\/([0-9a-f]{32})\)/g, (_match, alt: string, id: string) => {
        if (!resourceById.has(id)) {
          warnings.add(
            "An image or link pointed at something that is not in the export."
          );
          return "";
        }
        rewrittenLinks += 1;
        return `![${alt}](attachment:${id})`;
      })
      .replace(/\[([^\]]*)\]\(:\/([0-9a-f]{32})\)/g, (_match, label: string, id: string) => {
        if (resourceById.has(id)) {
          rewrittenLinks += 1;
          return `[${label}](attachment:${id})`;
        }
        if (knownNotes.has(id)) {
          warnings.add("A link to another note was kept as plain text.");
        } else {
          warnings.add(
            "An image or link pointed at something that is not in the export."
          );
        }
        return label;
      })
      .replace(
        /(?:\.\/)?resources\/([0-9a-f]{32})\.[A-Za-z0-9]+/g,
        (_match, id: string) => {
          if (!resourceById.has(id)) {
            warnings.add(
              "An image or link pointed at something that is not in the export."
            );
            return "#";
          }
          rewrittenLinks += 1;
          return `attachment:${id}`;
        }
      );

    output = output.replace(/:\/([0-9a-f]{32})/g, (_match, id: string) => {
      if (resourceById.has(id)) {
        rewrittenLinks += 1;
        return `attachment:${id}`;
      }
      return "#";
    });

    return output;
  }

  const notes: JoplinNote[] = [];

  for (const item of noteItems) {
    if (Number(item.metadata.deleted_time ?? 0) > 0) {
      skipped.push({ path: item.path, reason: "Trashed in Joplin" });
      continue;
    }

    const bodyHtml = sanitizeHtml(markdownToHtml(rewrite(item.body)));
    const resourceIds = [
      ...new Set(
        Array.from(bodyHtml.matchAll(/attachment:([0-9a-f]{32})/g)).map(
          (match) => match[1]
        )
      ),
    ];

    notes.push({
      id: item.metadata.id,
      title: item.title,
      bodyHtml,
      notebookId: HEX_ID.test(item.metadata.parent_id ?? "")
        ? item.metadata.parent_id
        : null,
      createdAt: timestamp(item.metadata.created_time),
      updatedAt: timestamp(item.metadata.updated_time),
      resourceIds,
    });
  }

  const depthOf = new Map<string, number>();
  const notebooksById = new Map(notebooks.map((entry) => [entry.id, entry]));
  for (const notebook of notebooks) {
    const seen = new Set<string>();
    let current: JoplinNotebook | undefined = notebook;
    let value = 0;

    while (current?.parentId && notebooksById.has(current.parentId)) {
      if (seen.has(current.id) || value > notebooks.length) break;
      seen.add(current.id);
      value += 1;
      current = notebooksById.get(current.parentId);
    }

    depthOf.set(notebook.id, value);
  }

  notebooks.sort(
    (left, right) =>
      (depthOf.get(left.id) ?? 0) - (depthOf.get(right.id) ?? 0) ||
      left.title.localeCompare(right.title)
  );
  notes.sort(
    (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
  );

  if (notes.length === 0) {
    warnings.add("This export contains no notes.");
  }

  return {
    notebooks,
    notes,
    resources,
    skipped,
    warnings: [...warnings],
    counts: {
      notes: notes.length,
      notebooks: notebooks.length,
      resources: resources.length,
      skipped: skipped.length,
      rewrittenLinks,
    },
  };
}
