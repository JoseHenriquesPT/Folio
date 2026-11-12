import { sanitizeHtml } from "./sanitize";
import {
  asString,
  asTimestamp,
  cleanTags,
  isRecord,
  notebookPathTree,
  pathKey,
} from "./importParsing";
import {
  orderNotebooks,
  type ImportAttachment,
  type ImportNotebook,
  type ImportNote,
  type ImportPlan,
  type ImportSkip,
} from "./importPlan";

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function notebookTitles(notebooks: ImportNotebook[]): Map<string, string> {
  return new Map(notebooks.map((notebook) => [notebook.id, notebook.title]));
}

function notebookPath(
  id: string,
  notebooks: Map<string, ImportNotebook>,
  titles: Map<string, string>,
  declared: Map<string, string[]>,
  seen = new Set<string>()
): string[] {
  const direct = declared.get(id);
  if (direct && direct.length > 0) return direct;
  if (seen.has(id)) return [];

  const notebook = notebooks.get(id);
  if (!notebook) return [];

  seen.add(id);
  const parent = notebook.parentId
    ? notebookPath(notebook.parentId, notebooks, titles, declared, seen)
    : [];
  return [...parent, titles.get(id) ?? notebook.title];
}

interface AttachmentCandidate {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

function attachmentFrom(value: unknown): AttachmentCandidate | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id)?.trim();
  const fileName = asString(value.fileName)?.trim();
  if (!id || !fileName) return null;

  return {
    id,
    fileName,
    mimeType: asString(value.mimeType)?.trim() || "application/octet-stream",
    sizeBytes: asNumber(value.sizeBytes),
  };
}

function candidatesByNote(
  entries: unknown[]
): Map<string, AttachmentCandidate[]> {
  const byNote = new Map<string, AttachmentCandidate[]>();

  for (const item of entries) {
    if (!isRecord(item)) continue;
    const noteId = asString(item.noteId);
    const candidate = attachmentFrom(item);
    if (!noteId || !candidate) continue;

    const list = byNote.get(noteId);
    if (!list) {
      byNote.set(noteId, [candidate]);
    } else if (!list.some((existing) => existing.id === candidate.id)) {
      list.push(candidate);
    }
  }

  return byNote;
}

function embeddedCandidates(
  entry: Record<string, unknown>
): AttachmentCandidate[] {
  const candidates: AttachmentCandidate[] = [];

  for (const item of Array.isArray(entry.attachments) ? entry.attachments : []) {
    const candidate = attachmentFrom(item);
    if (
      candidate &&
      !candidates.some((existing) => existing.id === candidate.id)
    ) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Reads the restore-oriented JSON backup: stored HTML bodies, the notebook
 * tree, tags, timestamps, and the attachment manifest. The file carries no
 * attachment bytes, so those entries stay as source ids for the writer to
 * re-fetch from the same account's storage.
 */
export function planFolioBackupImport(text: string): ImportPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }

  if (!isRecord(raw) || raw.format !== "folio-backup") {
    throw new Error("This file is not a Folio JSON backup.");
  }
  if (typeof raw.version !== "number" || raw.version < 1) {
    throw new Error("This file is not a Folio JSON backup.");
  }
  if (raw.version > 1) {
    throw new Error("This backup was made by a newer version of Folio.");
  }
  if (!Array.isArray(raw.notes)) {
    throw new Error("This backup does not contain a notes list.");
  }

  const skipped: ImportSkip[] = [];
  const warnings: string[] = [];
  const tree = notebookPathTree("backup-path");
  const notebooks = tree.notebooks;
  const notebookIds = new Set<string>();
  const declaredPaths = new Map<string, string[]>();

  for (const entry of Array.isArray(raw.notebooks) ? raw.notebooks : []) {
    if (!isRecord(entry)) continue;

    const id = asString(entry.id);
    const title = asString(entry.title);
    if (!id || !title || notebookIds.has(id)) continue;

    notebookIds.add(id);
    notebooks.push({
      id,
      title,
      parentId: asString(entry.parentId),
    });

    const path = asStringList(entry.path).map((part) => part.trim()).filter(Boolean);
    if (path.length > 0) declaredPaths.set(id, path);
  }

  for (const notebook of notebooks) {
    if (
      notebook.parentId === notebook.id ||
      (notebook.parentId !== null && !notebookIds.has(notebook.parentId))
    ) {
      notebook.parentId = null;
    }
  }

  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const titles = notebookTitles(notebooks);

  for (const notebook of notebooks) {
    const path = notebookPath(notebook.id, byId, titles, declaredPaths);
    if (path.length > 0) tree.byPath.set(pathKey(path), notebook.id);
  }

  const attachments: ImportAttachment[] = [];
  const attachmentsById = new Map<string, ImportAttachment>();
  const flatByNote = candidatesByNote(
    Array.isArray(raw.attachments) ? raw.attachments : []
  );
  const notes: ImportNote[] = [];
  const tagNames = new Set<string>();
  let unknownRefs = false;

  raw.notes.forEach((entry, index) => {
    if (!isRecord(entry) || !asString(entry.id)) {
      skipped.push({
        path: `note:${index + 1}`,
        reason: "Note entry is incomplete",
      });
      return;
    }

    const id = asString(entry.id) as string;
    const rawNotebookId = asString(entry.notebookId);
    const path = asStringList(entry.notebookPath)
      .map((part) => part.trim())
      .filter(Boolean);

    const notebookId =
      rawNotebookId && notebookIds.has(rawNotebookId)
        ? rawNotebookId
        : tree.ensure(path);

    const candidates =
      flatByNote.get(id) ?? embeddedCandidates(entry);

    const attachmentIds: string[] = [];

    for (const candidate of candidates) {
      attachmentIds.push(candidate.id);

      if (attachmentsById.has(candidate.id)) continue;

      const attachment: ImportAttachment = {
        id: candidate.id,
        sourceNoteId: id,
        fileName: candidate.fileName,
        mimeType: candidate.mimeType,
        sizeBytes: candidate.sizeBytes,
      };

      attachmentsById.set(candidate.id, attachment);
      attachments.push(attachment);
    }

    const bodyHtml = sanitizeHtml(asString(entry.bodyHtml) ?? "");
    const known = new Set(attachmentIds);
    for (const match of bodyHtml.matchAll(/attachment:([A-Za-z0-9-]+)/g)) {
      if (!known.has(match[1])) unknownRefs = true;
    }

    const tags = cleanTags(entry.tags);
    for (const tag of tags) tagNames.add(tag.toLowerCase());

    notes.push({
      id,
      title: asString(entry.title) ?? "",
      bodyHtml,
      notebookId,
      createdAt: asTimestamp(entry.createdAt),
      updatedAt: asTimestamp(entry.updatedAt),
      archived: entry.archived === true,
      tags,
      attachmentIds,
    });
  });

  if (attachments.length > 0) {
    warnings.push(
      `The JSON backup lists ${attachments.length} ${
        attachments.length === 1 ? "attachment" : "attachments"
      } but does not contain the files. Folio will try to re-fetch them from your storage during import.`
    );
  }
  if (unknownRefs) {
    warnings.push(
      "Some inline files were not listed in the backup and will be removed."
    );
  }
  if (notes.length === 0) {
    warnings.push("This backup contains no notes.");
  }

  return {
    source: "folio-json",
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
      linksRewritten: 0,
    },
  };
}
