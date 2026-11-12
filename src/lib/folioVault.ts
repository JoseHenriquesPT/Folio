import JSZip from "jszip";
import { parseFrontMatter } from "./frontmatter";
import {
  asString,
  asTimestamp,
  cleanTags,
  isRecord,
  notebookPathTree,
} from "./importParsing";
import {
  orderNotebooks,
  type ImportAttachment,
  type ImportNote,
  type ImportPlan,
  type ImportSkip,
} from "./importPlan";
import { markdownToHtml } from "./markdown";
import { sanitizeHtml } from "./sanitize";

type FrontMatter = ReturnType<typeof parseFrontMatter>["data"];

interface ManifestAttachment {
  id: string;
  noteId: string;
  fileName: string;
  path: string;
  mimeType: string;
}

const NOTEBOOK_SEPARATOR = " / ";

function splitNotebookPath(value: string): string[] {
  return value
    .split(NOTEBOOK_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

function noteFolder(path: string): string[] {
  const parts = path.split("/");
  parts.pop();
  return parts.filter(Boolean);
}

function relativePath(folder: string[], target: string): string {
  return `${"../".repeat(folder.length)}${target}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(/&amp;/g, "&");
}

function resolveZipPath(folder: string[], src: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) return null;

  const parts = [...folder, ...src.split("/")];
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }

  return resolved.join("/");
}

function frontMatterString(frontMatter: FrontMatter, key: string): string | null {
  const value = frontMatter[key];
  return typeof value === "string" ? value : null;
}

function frontMatterList(frontMatter: FrontMatter, key: string): string[] | null {
  const value = frontMatter[key];
  return Array.isArray(value) ? value : null;
}

function rewriteMarkdownReference(
  markdown: string,
  target: string,
  replacement: (label: string, image: boolean) => string
): { markdown: string; count: number } {
  const encoded = escapeRegExp(encodeURI(target));
  const raw = escapeRegExp(target);
  const pattern = new RegExp(
    `(!?)\\[([^\\]]*)\\]\\((?:<)?(?:${raw}|${encoded})(?:>)?(?:\\s+"[^"]*")?\\)`,
    "g"
  );

  let count = 0;
  const next = markdown.replace(pattern, (_match, bang: string, label: string) => {
    count += 1;
    return replacement(label, bang === "!");
  });

  return { markdown: next, count };
}

function stripUnresolvedImages(
  html: string,
  folder: string[],
  unavailable: Set<string>
): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = /\bsrc="([^"]*)"/i.exec(tag);
    if (!match) return tag;

    const src = decodeHtmlAttribute(match[1]);
    const resolved = resolveZipPath(folder, src);
    return resolved && unavailable.has(resolved) ? "" : tag;
  });
}

/**
 * Reads a Folio vault zip: the Markdown files are the authored copy, the
 * manifest supplies the notebook tree and attachment paths, and the archive
 * supplies the attachment bytes. The zip has no wrapper folder.
 */
export async function planFolioVaultImport(
  archive: Uint8Array
): Promise<ImportPlan> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archive);
  } catch {
    throw new Error("This file is not a Folio vault export.");
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("This zip is not a Folio vault export.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await manifestFile.async("string"));
  } catch {
    throw new Error("This zip is not a Folio vault export.");
  }

  if (!isRecord(raw) || raw.format !== "folio-vault-export") {
    throw new Error("This zip is not a Folio vault export.");
  }
  if (typeof raw.version !== "number" || raw.version < 1) {
    throw new Error("This zip is not a Folio vault export.");
  }
  if (raw.version > 1) {
    throw new Error("This archive was made by a newer version of Folio.");
  }
  if (!Array.isArray(raw.notes)) {
    throw new Error("This archive does not contain a notes manifest.");
  }

  const manifestNotebooks = Array.isArray(raw.notebooks) ? raw.notebooks : [];
  const manifestNotes = raw.notes;
  const manifestAttachments = Array.isArray(raw.attachments)
    ? raw.attachments
    : [];
  const skipped: ImportSkip[] = [];
  const warnings: string[] = [];
  const tree = notebookPathTree("vault-path");
  const notebooks = tree.notebooks;

  function ensureNotebookPath(value: string | null): string | null {
    return value ? tree.ensure(splitNotebookPath(value)) : null;
  }

  for (const entry of manifestNotebooks) {
    if (!isRecord(entry)) continue;
    ensureNotebookPath(asString(entry.path));
  }

  for (const entry of manifestNotes) {
    if (!isRecord(entry) || !asString(entry.path)) continue;
    ensureNotebookPath(asString(entry.notebook));
  }

  const attachmentEntries: ManifestAttachment[] = [];
  for (const entry of manifestAttachments) {
    if (!isRecord(entry)) continue;

    const id = asString(entry.id);
    const noteId = asString(entry.noteId);
    const path = asString(entry.path);
    if (!id || !noteId || !path) continue;

    attachmentEntries.push({
      id,
      noteId,
      fileName: asString(entry.fileName)?.trim() || path.split("/").pop() || id,
      path,
      mimeType:
        asString(entry.mimeType)?.trim() || "application/octet-stream",
    });
  }

  const attachments: ImportAttachment[] = [];
  const availableById = new Map<string, ImportAttachment>();
  const attachmentPaths = new Set<string>();

  for (const entry of attachmentEntries) {
    attachmentPaths.add(entry.path);
    const file = zip.file(entry.path);

    if (!file) {
      skipped.push({
        path: entry.path,
        reason: "Attachment is missing from the archive",
      });
      continue;
    }

    try {
      const bytes = await file.async("uint8array");

      if (availableById.has(entry.id)) continue;

      const attachment: ImportAttachment = {
        id: entry.id,
        sourceNoteId: entry.noteId,
        fileName: entry.fileName,
        mimeType: entry.mimeType,
        sizeBytes: bytes.byteLength,
        bytes,
      };

      availableById.set(entry.id, attachment);
      attachments.push(attachment);
    } catch {
      skipped.push({
        path: entry.path,
        reason: "Attachment could not be read from the archive",
      });
    }
  }

  const notes: ImportNote[] = [];
  const tagNames = new Set<string>();
  const handledPaths = new Set<string>(["manifest.json", "README.txt"]);
  let rewrittenLinks = 0;
  let removedMissingFiles = false;


  for (const [index, entry] of manifestNotes.entries()) {
    if (!isRecord(entry) || !asString(entry.id) || !asString(entry.path)) {
      skipped.push({
        path: `note:${index + 1}`,
        reason: "Note entry is incomplete",
      });
      continue;
    }

    const id = asString(entry.id) as string;
    const notePath = asString(entry.path) as string;
    const noteFile = zip.file(notePath);

    if (!noteFile) {
      skipped.push({
        path: notePath,
        reason: "Note file is missing from the archive",
      });
      continue;
    }

    handledPaths.add(notePath);
    const folder = noteFolder(notePath);

    let text: string;
    try {
      text = await noteFile.async("string");
    } catch {
      skipped.push({
        path: notePath,
        reason: "Note file could not be read from the archive",
      });
      continue;
    }

    const parsed = parseFrontMatter(text);
    const noteTitle =
      frontMatterString(parsed.data, "title") ??
      asString(entry.title) ??
      "";
    const manifestTags = cleanTags(entry.tags);
    const frontMatterTags = frontMatterList(parsed.data, "tags");
    const tags =
      frontMatterTags === null ? manifestTags : cleanTags(frontMatterTags);
    const notebookId = ensureNotebookPath(
      asString(entry.notebook) ?? frontMatterString(parsed.data, "notebook")
    );
    const archived =
      typeof parsed.data.archived === "boolean"
        ? parsed.data.archived
        : entry.archived === true;

    const owned = attachmentEntries.filter(
      (attachment) => attachment.noteId === id
    );
    let markdown = parsed.body;

    for (const manifestAttachment of owned) {
      const attachment = availableById.get(manifestAttachment.id);
      if (!attachment) continue;

      const target = relativePath(folder, manifestAttachment.path);
      const result = rewriteMarkdownReference(
        markdown,
        target,
        (label, image) => `${image ? "!" : ""}[${label}](attachment:${attachment.id})`
      );
      markdown = result.markdown;
      rewrittenLinks += result.count;
    }

    const unavailable = owned
      .filter((attachment) => !availableById.has(attachment.id))
      .map((attachment) => attachment.path);

    for (const path of unavailable) {
      const result = rewriteMarkdownReference(
        markdown,
        relativePath(folder, path),
        (label) => label
      );
      markdown = result.markdown;
      if (result.count > 0) removedMissingFiles = true;
    }

    let bodyHtml = sanitizeHtml(markdownToHtml(markdown));
    bodyHtml = stripUnresolvedImages(bodyHtml, folder, new Set(unavailable));

    const attachmentIds = new Set(
      owned
        .filter((attachment) => availableById.has(attachment.id))
        .map((attachment) => attachment.id)
    );
    for (const match of bodyHtml.matchAll(/attachment:([A-Za-z0-9-]+)/g)) {
      if (availableById.has(match[1])) attachmentIds.add(match[1]);
    }

    for (const tag of tags) tagNames.add(tag.toLowerCase());

    notes.push({
      id,
      title: noteTitle,
      bodyHtml,
      notebookId,
      createdAt:
        asTimestamp(parsed.data.created) ?? asTimestamp(entry.created),
      updatedAt:
        asTimestamp(parsed.data.updated) ?? asTimestamp(entry.updated),
      archived,
      tags,
      attachmentIds: [...attachmentIds],
    });
  }

  for (const file of Object.values(zip.files)) {
    if (file.dir || handledPaths.has(file.name)) continue;
    if (attachmentPaths.has(file.name)) continue;
    skipped.push({
      path: file.name,
      reason: "Not referenced by the manifest",
    });
  }

  if (removedMissingFiles) {
    warnings.push(
      "Some images or file links pointed at files missing from the archive and were removed."
    );
  }
  if (notes.length === 0) {
    warnings.push("This archive contains no notes.");
  }

  return {
    source: "folio-vault",
    rootLabel: "Folio",
    notebooks: orderNotebooks(notebooks),
    notes,
    attachments,
    skipped,
    warnings,
    counts: {
      notes: notes.length,
      notebooks: notebooks.length,
      attachments: attachments.length,
      tags: tagNames.size,
      skipped: skipped.length,
      linksRewritten: rewrittenLinks,
    },
  };
}
