import {
  formatFrontMatter,
  type NoteFrontMatter,
} from "./frontmatter";
import { notebookFolders, slugifyFileName, uniqueFileNames } from "./exportPaths";
import { htmlToMarkdown } from "./markdown";
import { sanitizeHtml } from "./sanitize";

export interface ExportNote {
  id: string;
  ownerId: string;
  title: string;
  bodyHtml: string;
  notebookId: string | null;
  archived: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface ExportNotebook {
  id: string;
  title: string;
  parentId: string | null;
}

export interface ExportAttachment {
  id: string;
  noteId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ExportSource {
  ownerId: string;
  notes: ExportNote[];
  notebooks: ExportNotebook[];
  attachments: ExportAttachment[];
}

export interface ExportFile {
  path: string;
  content: string;
}

export interface ExportMedia {
  path: string;
  attachment: ExportAttachment;
  mimeType: string;
}

export interface ExportManifestEntry {
  id: string;
  title: string;
  path: string;
  notebook: string | null;
  tags: string[];
  created: string;
  updated: string;
  archived: boolean;
  attachments: Array<{
    fileName: string;
    path: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

export interface ExportManifest {
  format: "folio-vault-export";
  version: 1;
  app: "Folio";
  exportedAt: string;
  counts: { notes: number; notebooks: number; attachments: number };
  notebooks: Array<{ id: string; title: string; path: string }>;
  notes: ExportManifestEntry[];
  attachments: Array<{
    id: string;
    noteId: string;
    fileName: string;
    path: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  excluded: { trashed: number; shared: number };
}

export interface VaultExportPlan {
  root: string;
  files: ExportFile[];
  media: ExportMedia[];
  manifest: ExportManifest;
  counts: { notes: number; notebooks: number; attachments: number };
}

export interface NoteExportInput {
  note: ExportNote;
  notebookPath: string[];
  attachments: ExportAttachment[];
  zip: boolean;
  now: Date;
}

export interface NoteExportPlan {
  root: string;
  files: ExportFile[];
  media: ExportMedia[];
  warnings: string[];
}

const ATTACHMENT_REF = /attachment:([A-Za-z0-9-]+)/g;

function splitFileName(fileName: string): { base: string; extension: string } {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) {
    return { base: fileName, extension: "" };
  }
  return { base: fileName.slice(0, dot), extension: fileName.slice(dot + 1) };
}

function exportedAttachments(
  attachments: ExportAttachment[],
  folder: string[]
): { media: ExportMedia[]; byId: Map<string, string> } {
  const names = uniqueFileNames(
    attachments.map((attachment) => {
      const { base, extension } = splitFileName(attachment.fileName);
      return { key: attachment.id, base: slugifyFileName(base, "Attachment"), extension };
    })
  );

  const byId = new Map<string, string>();
  const media: ExportMedia[] = [];

  for (const attachment of attachments) {
    const name = names.get(attachment.id) ?? slugifyFileName(attachment.fileName);
    const path = ["attachments", attachment.noteId, name].join("/");
    byId.set(attachment.id, path);
    media.push({ path, attachment, mimeType: attachment.mimeType });
  }

  return { media, byId: new Map([...byId].map(([id, path]) => [id, relative(folder, path)])) };
}

function relative(fromFolder: string[], toPath: string): string {
  return `${"../".repeat(fromFolder.length)}${toPath}`;
}

function noteMarkdown(
  note: ExportNote,
  notebookPath: string[] | null,
  images: Map<string, string>
): string {
  const frontMatter: NoteFrontMatter = {
    title: note.title,
    notebook: notebookPath && notebookPath.length > 0 ? notebookPath.join(" / ") : null,
    tags: note.tags,
    created: note.createdAt,
    updated: note.updatedAt,
    archived: note.archived,
  };

  const body = htmlToMarkdown(note.bodyHtml, {
    resolveImage: (src) => {
      const match = /^attachment:([A-Za-z0-9-]+)$/.exec(src);
      if (!match) return null;
      return images.get(match[1]) ?? null;
    },
  });

  return `${formatFrontMatter(frontMatter)}${body}`;
}

function archiveDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

interface PlannedNote {
  note: ExportNote;
  folder: string[];
  name: string;
  path: string;
}

function planNotes(
  notes: ExportNote[],
  folders: Map<string, string[]>
): PlannedNote[] {
  const rows = notes
    .map((note) => ({
      note,
      folder: note.notebookId ? (folders.get(note.notebookId) ?? []) : [],
      base: slugifyFileName(note.title),
    }))
    .sort(
      (left, right) =>
        left.folder.join("/").localeCompare(right.folder.join("/")) ||
        left.base.localeCompare(right.base) ||
        left.note.id.localeCompare(right.note.id)
    );

  const byFolder = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = byFolder.get(row.folder.join("/"));
    if (existing) {
      existing.push(row);
    } else {
      byFolder.set(row.folder.join("/"), [row]);
    }
  }

  const planned: PlannedNote[] = [];
  for (const group of byFolder.values()) {
    const names = uniqueFileNames(
      group.map((row) => ({ key: row.note.id, base: row.base, extension: "md" }))
    );

    for (const row of group) {
      const name = names.get(row.note.id) ?? `${row.base}.md`;
      planned.push({
        note: row.note,
        folder: row.folder,
        name,
        path: [...row.folder, name].join("/"),
      });
    }
  }

  return planned.sort(
    (left, right) =>
      stemPath(left.path).localeCompare(stemPath(right.path)) ||
      left.path.localeCompare(right.path)
  );
}

function stemPath(path: string): string {
  return path.endsWith(".md") ? path.slice(0, -3) : path;
}

function buildReadme(
  exportedAt: string,
  counts: { notes: number; notebooks: number; attachments: number }
): string {
  const notes = `${counts.notes} ${counts.notes === 1 ? "note" : "notes"}`;
  const attachments = `${counts.attachments} ${
    counts.attachments === 1 ? "attachment" : "attachments"
  }`;

  return [
    "Folio vault export",
    "==================",
    "",
    `Exported: ${exportedAt}`,
    `Contents: ${notes}, ${attachments}, ${counts.notebooks} ${
      counts.notebooks === 1 ? "notebook" : "notebooks"
    }.`,
    "",
    "Folders mirror your notebooks. Notes in no notebook sit at the top level.",
    "Each note is a Markdown file with YAML front matter (title, notebook,",
    "tags, created, updated, archived). Attachments live under",
    "attachments/<note-id>/ and are linked relatively, so the archive opens",
    "without Folio.",
    "",
    "manifest.json lists every note, notebook, tag, and attachment path.",
    "Archived notes are included and marked; Trash is not exported.",
    "Restoring this archive into Folio is manual in v1; the manifest keeps",
    "every id you would need.",
    "",
  ].join("\n");
}

interface ScopedNotes {
  included: ExportNote[];
  trashed: number;
  shared: number;
}

/**
 * FR-E4: the full exports carry owned active and archived notes, never Trash,
 * never notes shared with the current user. Both planners must agree, so they
 * share this scope.
 */
function scopedNotes(source: ExportSource): ScopedNotes {
  const included: ExportNote[] = [];
  let trashed = 0;
  let shared = 0;

  for (const note of source.notes) {
    if (note.ownerId !== source.ownerId) {
      shared += 1;
      continue;
    }
    if (note.deletedAt) {
      trashed += 1;
      continue;
    }
    included.push(note);
  }

  return { included, trashed, shared };
}

export function planVaultExport(
  source: ExportSource,
  options: { now: Date }
): VaultExportPlan {
  const { included, trashed, shared } = scopedNotes(source);

  const folders = notebookFolders(source.notebooks);
  const planned = planNotes(included, folders);
  const includedIds = new Set(included.map((note) => note.id));
  const attachmentsByNote = new Map<string, ExportAttachment[]>();

  for (const attachment of source.attachments) {
    if (!includedIds.has(attachment.noteId)) continue;
    const existing = attachmentsByNote.get(attachment.noteId);
    if (existing) {
      existing.push(attachment);
    } else {
      attachmentsByNote.set(attachment.noteId, [attachment]);
    }
  }

  const files: ExportFile[] = [];
  const media: ExportMedia[] = [];
  const entries: ExportManifestEntry[] = [];
  const exportedAt = options.now.toISOString();

  for (const plannedNote of planned) {
    const attachments = (attachmentsByNote.get(plannedNote.note.id) ?? []).sort((left, right) =>
      left.fileName.localeCompare(right.fileName) || left.id.localeCompare(right.id)
    );
    const exported = exportedAttachments(attachments, plannedNote.folder);

    media.push(...exported.media);
    files.push({
      path: plannedNote.path,
      content: noteMarkdown(
        plannedNote.note,
        plannedNote.folder.length > 0 ? plannedNote.folder : null,
        exported.byId
      ),
    });

    entries.push({
      id: plannedNote.note.id,
      title: plannedNote.note.title,
      path: plannedNote.path,
      notebook:
        plannedNote.folder.length > 0 ? plannedNote.folder.join(" / ") : null,
      tags: plannedNote.note.tags,
      created: plannedNote.note.createdAt,
      updated: plannedNote.note.updatedAt,
      archived: plannedNote.note.archived,
      attachments: exported.media.map((item) => ({
        fileName: item.attachment.fileName,
        path: item.path,
        mimeType: item.mimeType,
        sizeBytes: item.attachment.sizeBytes,
      })),
    });
  }

  const notes = planned.length;
  const counts = {
    notes,
    notebooks: source.notebooks.length,
    attachments: media.length,
  };

  const manifest: ExportManifest = {
    format: "folio-vault-export",
    version: 1,
    app: "Folio",
    exportedAt,
    counts,
    notebooks: source.notebooks
      .map((notebook) => ({
        id: notebook.id,
        title: notebook.title,
        path: (folders.get(notebook.id) ?? [notebook.title]).join(" / "),
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    notes: entries,
    attachments: media
      .map((item) => ({
        id: item.attachment.id,
        noteId: item.attachment.noteId,
        fileName: item.attachment.fileName,
        path: item.path,
        mimeType: item.mimeType,
        sizeBytes: item.attachment.sizeBytes,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    excluded: { trashed, shared },
  };

  return {
    root: `folio-export-${archiveDate(options.now)}`,
    files: [
      { path: "README.txt", content: buildReadme(exportedAt, counts) },
      { path: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` },
      ...files,
    ],
    media,
    manifest,
    counts,
  };
}

export interface JsonBackupAttachment {
  id: string;
  noteId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface JsonBackupNote {
  id: string;
  title: string;
  bodyHtml: string;
  notebookId: string | null;
  notebookPath: string[] | null;
  tags: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: Array<Omit<JsonBackupAttachment, "noteId">>;
}

export interface JsonBackup {
  format: "folio-backup";
  version: 1;
  app: "Folio";
  exportedAt: string;
  counts: { notes: number; notebooks: number; attachments: number; tags: number };
  tags: string[];
  notebooks: Array<{
    id: string;
    title: string;
    parentId: string | null;
    path: string[];
  }>;
  notes: JsonBackupNote[];
  attachments: JsonBackupAttachment[];
  excluded: { trashed: number; shared: number };
}

export interface JsonBackupPlan {
  fileName: string;
  content: string;
  backup: JsonBackup;
}

/**
 * The JSON backup is the restore-oriented twin of the vault export: same scope
 * (owned, non-trashed notes), but with the stored HTML body instead of Markdown
 * so a future importer does not have to round-trip through Turndown.
 */
export function planJsonBackup(
  source: ExportSource,
  options: { now: Date }
): JsonBackupPlan {
  const { included, trashed, shared } = scopedNotes(source);

  const folders = notebookFolders(source.notebooks);
  const planned = planNotes(included, folders);
  const includedIds = new Set(included.map((note) => note.id));

  const attachmentsByNote = new Map<string, JsonBackupAttachment[]>();
  const flatAttachments: JsonBackupAttachment[] = [];

  for (const attachment of source.attachments) {
    if (!includedIds.has(attachment.noteId)) continue;

    const entry: JsonBackupAttachment = {
      id: attachment.id,
      noteId: attachment.noteId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };

    const existing = attachmentsByNote.get(attachment.noteId);
    if (existing) {
      existing.push(entry);
    } else {
      attachmentsByNote.set(attachment.noteId, [entry]);
    }
    flatAttachments.push(entry);
  }

  const byName = (left: JsonBackupAttachment, right: JsonBackupAttachment) =>
    left.fileName.localeCompare(right.fileName) || left.id.localeCompare(right.id);

  const notes: JsonBackupNote[] = planned.map((plannedNote) => {
    const attachments = (attachmentsByNote.get(plannedNote.note.id) ?? []).sort(byName);

    return {
      id: plannedNote.note.id,
      title: plannedNote.note.title,
      bodyHtml: plannedNote.note.bodyHtml,
      notebookId: plannedNote.note.notebookId,
      notebookPath: plannedNote.folder.length > 0 ? plannedNote.folder : null,
      tags: plannedNote.note.tags,
      archived: plannedNote.note.archived,
      createdAt: plannedNote.note.createdAt,
      updatedAt: plannedNote.note.updatedAt,
      attachments: attachments.map((item) => ({
        id: item.id,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
      })),
    };
  });

  const tags = [
    ...new Set(included.flatMap((note) => note.tags)),
  ].sort((left, right) => left.localeCompare(right));

  const notebooks = source.notebooks
    .map((notebook) => ({
      id: notebook.id,
      title: notebook.title,
      parentId: notebook.parentId,
      path: folders.get(notebook.id) ?? [notebook.title],
    }))
    .sort(
      (left, right) =>
        left.path.join(" / ").localeCompare(right.path.join(" / ")) ||
        left.id.localeCompare(right.id)
    );

  const attachments = flatAttachments.sort(
    (left, right) => left.noteId.localeCompare(right.noteId) || byName(left, right)
  );

  const exportedAt = options.now.toISOString();
  const backup: JsonBackup = {
    format: "folio-backup",
    version: 1,
    app: "Folio",
    exportedAt,
    counts: {
      notes: notes.length,
      notebooks: notebooks.length,
      attachments: attachments.length,
      tags: tags.length,
    },
    tags,
    notebooks,
    notes,
    attachments,
    excluded: { trashed, shared },
  };

  return {
    fileName: `folio-backup-${archiveDate(options.now)}.json`,
    content: `${JSON.stringify(backup, null, 2)}\n`,
    backup,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function planNoteExport(input: NoteExportInput): NoteExportPlan {
  const root = slugifyFileName(input.note.title);
  const warnings: string[] = [];
  const media: ExportMedia[] = [];
  const images = new Map<string, string>();

  for (const attachment of input.attachments) {
    const { base, extension } = splitFileName(attachment.fileName);
    const name = `${slugifyFileName(base, "Attachment")}${extension ? `.${extension}` : ""}`;
    const path = `attachments/${name}`;

    images.set(attachment.id, path);
    media.push({ path, attachment, mimeType: attachment.mimeType });
  }

  if (!input.zip && input.attachments.length > 0) {
    warnings.push("The note has attachments. Download the zip to keep them.");
  }

  const markdownPath = `${root}.md`;
  const files: ExportFile[] = [
    {
      path: markdownPath,
      content: noteMarkdown(
        input.note,
        input.notebookPath.length > 0 ? input.notebookPath : null,
        images
      ),
    },
  ];

  if (input.zip) {
    const body = sanitizeHtml(input.note.bodyHtml).replace(
      ATTACHMENT_REF,
      (match, id: string) => images.get(id) ?? match
    );

    files.push({
      path: `${root}.html`,
      content: [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${escapeHtml(input.note.title)}</title>`,
        "</head>",
        "<body>",
        "<article>",
        `<h1>${escapeHtml(input.note.title)}</h1>`,
        body,
        "</article>",
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    });
  }

  return { root, files, media, warnings };
}
