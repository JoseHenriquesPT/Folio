import {
  attachmentRejection,
  stripAttachmentRefs,
} from "../lib/attachments";
import { toMessage } from "../lib/errors";
import {
  importRootName,
  orderNotebooks,
  type ImportAttachment,
  type ImportNote,
  type ImportPlan,
} from "../lib/importPlan";
import {
  buildAttachmentPath,
  downloadAttachmentObject,
  uploadAttachment,
} from "./attachments";
import { createNotebook } from "./notebooks";
import { createNote, saveNote, type Note } from "./notes";
import { attachTag, createTag, listTagsWithCounts } from "./tags";
import type { DbClient } from "./supabase";

export type ImportFailureKind = "notebook" | "note" | "attachment" | "tag";

export interface ImportFailure {
  kind: ImportFailureKind;
  name: string;
  message: string;
}

export interface ImportProgress {
  phase: "notebooks" | "notes";
  completed: number;
  total: number;
}

export interface ImportOptions {
  client: DbClient;
  plan: ImportPlan;
  now?: Date;
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
  /** Injected in tests so attachment refs are predictable. */
  newId?: () => string;
}

export interface ImportResult {
  rootNotebookId: string;
  rootNotebookName: string;
  notebooks: number;
  notes: number;
  attachments: number;
  /** Tags created by this import; tags that already existed are reused. */
  tags: number;
  failures: ImportFailure[];
  cancelled: boolean;
}

const ATTACHMENT_REF = /attachment:([A-Za-z0-9-]+)/g;

function defaultId(): string {
  return crypto.randomUUID();
}

/**
 * Writes any parsed import plan into Folio: one dated root notebook that owns
 * the whole import, the notebook tree beneath it, the notes with their original
 * timestamps, archive state and tags, and their files. A single bad item is
 * reported and skipped rather than aborting the run, because a 145-note import
 * should not fail over one attachment.
 */
export async function runImport(options: ImportOptions): Promise<ImportResult> {
  const { client, plan } = options;
  const signal = options.signal;
  const newId = options.newId ?? defaultId;
  const now = options.now ?? new Date();

  const failures: ImportFailure[] = [];
  const notebookIds = new Map<string, string>();

  const root = await createNotebook(client, {
    name: importRootName(plan.rootLabel, now),
  });
  let notebooks = 1;
  let notes = 0;
  let attachments = 0;
  let tags = 0;

  const positions = new Map<string | null, number>();
  const nextPosition = (parentId: string | null) => {
    const value = positions.get(parentId) ?? 0;
    positions.set(parentId, value + 1);
    return value;
  };

  const partial = (cancelled: boolean): ImportResult => ({
    rootNotebookId: root.id,
    rootNotebookName: root.name,
    notebooks,
    notes,
    attachments,
    tags,
    failures,
    cancelled,
  });

  for (const notebook of orderNotebooks(plan.notebooks)) {
    if (signal?.aborted) return partial(true);

    const parentId = notebook.parentId
      ? (notebookIds.get(notebook.parentId) ?? root.id)
      : root.id;

    try {
      const created = await createNotebook(client, {
        name: notebook.title,
        parentId,
        position: nextPosition(parentId),
      });
      notebookIds.set(notebook.id, created.id);
      notebooks += 1;
    } catch (error) {
      failures.push({
        kind: "notebook",
        name: notebook.title,
        message: toMessage(error),
      });
    }
  }

  options.onProgress?.({
    phase: "notebooks",
    completed: notebooks,
    total: plan.notebooks.length + 1,
  });

  const restored = await restoreTags(client, plan.notes, {
    signal,
    failures,
  });
  tags = restored.created;

  const attachmentById = new Map(
    plan.attachments.map((attachment) => [attachment.id, attachment])
  );
  let processed = 0;

  for (const note of plan.notes) {
    if (signal?.aborted) return partial(true);

    const notebookId = note.notebookId
      ? (notebookIds.get(note.notebookId) ?? root.id)
      : root.id;

    const planned = planNoteAttachments(
      note.attachmentIds,
      attachmentById,
      newId
    );
    let body = note.bodyHtml.replace(ATTACHMENT_REF, (match, id: string) => {
      const attachmentId = planned.ids.get(id);
      return attachmentId ? `attachment:${attachmentId}` : match;
    });
    let stripped = false;

    for (const id of planned.missing) {
      body = stripAttachmentRefs(body, id);
      stripped = true;
      failures.push({
        kind: "attachment",
        name: id,
        message: "The attachment is missing from the export.",
      });
    }

    let created: Note | null = null;
    try {
      created = await createNote(client, {
        title: note.title,
        bodyHtml: body,
        notebookId,
        createdAt: note.createdAt ?? undefined,
        updatedAt: note.updatedAt ?? note.createdAt ?? undefined,
        archived: note.archived,
      });
      notes += 1;
    } catch (error) {
      failures.push({
        kind: "note",
        name: note.title.trim() || "Untitled note",
        message: toMessage(error),
      });
    }

    if (created) {
      for (const name of note.tags) {
        const tagId = restored.ids.get(name.trim().toLowerCase());
        if (!tagId) continue;

        try {
          await attachTag(client, created.id, tagId);
        } catch (error) {
          failures.push({ kind: "tag", name, message: toMessage(error) });
        }
      }

      for (const item of planned.files) {
        const problem = await importAttachment(
          client,
          created.id,
          item.attachment,
          item.attachmentId
        );

        if (problem === null) {
          attachments += 1;
          continue;
        }

        failures.push({
          kind: "attachment",
          name: item.attachment.fileName,
          message: problem,
        });
        body = stripAttachmentRefs(body, item.attachmentId);
        stripped = true;
      }

      if (stripped) {
        try {
          await saveNote(client, {
            noteId: created.id,
            expectedVersion: created.version,
            title: created.title,
            bodyHtml: body,
          });
        } catch (error) {
          failures.push({
            kind: "note",
            name: note.title.trim() || "Untitled note",
            message: `The note kept a broken attachment link: ${toMessage(error)}`,
          });
        }
      }
    }

    processed += 1;
    options.onProgress?.({
      phase: "notes",
      completed: processed,
      total: plan.notes.length,
    });
  }

  return partial(false);
}

interface RestoredTags {
  ids: Map<string, string>;
  created: number;
}

/**
 * Tags are matched by name, case-insensitively, so importing a backup next to
 * existing tags reuses them instead of failing on the unique index. A tag that
 * cannot be created is reported and its notes keep importing untagged.
 */
async function restoreTags(
  client: DbClient,
  notes: ImportNote[],
  options: { signal?: AbortSignal; failures: ImportFailure[] }
): Promise<RestoredTags> {
  const wanted = new Map<string, string>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const name = tag.trim();
      const key = name.toLowerCase();
      if (name !== "" && !wanted.has(key)) wanted.set(key, name);
    }
  }

  const ids = new Map<string, string>();
  if (wanted.size === 0) return { ids, created: 0 };

  try {
    for (const tag of await listTagsWithCounts(client)) {
      const key = tag.name.trim().toLowerCase();
      if (!ids.has(key)) ids.set(key, tag.id);
    }
  } catch (error) {
    options.failures.push({
      kind: "tag",
      name: "Tags",
      message: `Existing tags could not be read: ${toMessage(error)}`,
    });
    return { ids, created: 0 };
  }

  let created = 0;

  for (const [key, name] of wanted) {
    if (ids.has(key)) continue;
    if (options.signal?.aborted) break;

    try {
      const tag = await createTag(client, { name });
      ids.set(key, tag.id);
      created += 1;
    } catch (error) {
      options.failures.push({ kind: "tag", name, message: toMessage(error) });
    }
  }

  return { ids, created };
}

interface PlannedAttachments {
  ids: Map<string, string>;
  files: Array<{ attachment: ImportAttachment; attachmentId: string }>;
  missing: string[];
}

function planNoteAttachments(
  attachmentIds: string[],
  attachments: Map<string, ImportAttachment>,
  newId: () => string
): PlannedAttachments {
  const ids = new Map<string, string>();
  const files: Array<{ attachment: ImportAttachment; attachmentId: string }> =
    [];
  const missing: string[] = [];

  for (const id of attachmentIds) {
    const attachment = attachments.get(id);
    if (!attachment) {
      missing.push(id);
      continue;
    }

    const attachmentId = newId();
    ids.set(id, attachmentId);
    files.push({ attachment, attachmentId });
  }

  return { ids, files, missing };
}

/**
 * Uploads one file and reports why it was skipped. Joplin and vault archives
 * carry the bytes; a JSON backup does not, so those files are downloaded again
 * from the same account's storage by their original path.
 */
async function importAttachment(
  client: DbClient,
  noteId: string,
  attachment: ImportAttachment,
  attachmentId: string
): Promise<string | null> {
  let file: File;

  try {
    file = await attachmentFile(client, attachment);
  } catch (error) {
    return attachment.bytes
      ? toMessage(error)
      : `The file could not be re-fetched from storage: ${toMessage(error)}`;
  }

  const rejection = attachmentRejection({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (rejection) return rejection;

  try {
    await uploadAttachment(client, { noteId, id: attachmentId, file });
    return null;
  } catch (error) {
    return toMessage(error);
  }
}

async function attachmentFile(
  client: DbClient,
  attachment: ImportAttachment
): Promise<File> {
  if (attachment.bytes) {
    return new File([attachment.bytes.slice()], attachment.fileName, {
      type: attachment.mimeType,
    });
  }

  if (!attachment.sourceNoteId) {
    throw new Error("The backup does not say where the file came from.");
  }

  const blob = await downloadAttachmentObject(
    client,
    buildAttachmentPath(
      attachment.sourceNoteId,
      attachment.id,
      attachment.fileName
    )
  );

  return new File([blob], attachment.fileName, {
    type: attachment.mimeType || blob.type,
  });
}
