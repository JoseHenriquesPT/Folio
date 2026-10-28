import {
  attachmentRejection,
  stripAttachmentRefs,
} from "../lib/attachments";
import { toMessage } from "../lib/errors";
import type { JoplinImportPlan, JoplinResource } from "../lib/joplin";
import { uploadAttachment } from "./attachments";
import { createNotebook } from "./notebooks";
import { createNote, saveNote, type Note } from "./notes";
import type { DbClient } from "./supabase";

export type ImportFailureKind = "notebook" | "note" | "attachment";

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

export interface JoplinImportOptions {
  client: DbClient;
  plan: JoplinImportPlan;
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
  failures: ImportFailure[];
  cancelled: boolean;
}

const RESOURCE_REF = /attachment:([0-9a-f]{32})/g;

function rootName(now: Date): string {
  return `Imported from Joplin — ${now.toISOString().slice(0, 10)}`;
}

function defaultId(): string {
  return crypto.randomUUID();
}

/**
 * Writes a parsed Joplin export into Folio: one dated root notebook that owns
 * the whole import, the notebook tree beneath it, and notes with their original
 * timestamps. A single bad item is reported and skipped rather than aborting
 * the run, because a 145-note import should not fail over one attachment.
 */
export async function runJoplinImport(
  options: JoplinImportOptions
): Promise<ImportResult> {
  const { client, plan } = options;
  const signal = options.signal;
  const newId = options.newId ?? defaultId;
  const now = options.now ?? new Date();

  const failures: ImportFailure[] = [];
  const notebookIds = new Map<string, string>();

  const root = await createNotebook(client, { name: rootName(now) });
  let notebooks = 1;
  let notes = 0;
  let attachments = 0;

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
    failures,
    cancelled,
  });

  for (const notebook of plan.notebooks) {
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

  const resourceById = new Map(plan.resources.map((item) => [item.id, item]));
  let processed = 0;

  for (const note of plan.notes) {
    if (signal?.aborted) return partial(true);

    const notebookId = note.notebookId
      ? (notebookIds.get(note.notebookId) ?? root.id)
      : root.id;

    const planned = planNoteResources(note.resourceIds, resourceById, newId);
    let body = note.bodyHtml.replace(RESOURCE_REF, (match, id: string) => {
      const attachmentId = planned.ids.get(id);
      return attachmentId ? `attachment:${attachmentId}` : match;
    });

    for (const id of planned.missing) {
      body = stripAttachmentRefs(body, id);
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
      let stripped = false;

      for (const item of planned.files) {
        const rejection = attachmentRejection({
          name: item.resource.fileName,
          type: item.resource.mimeType,
          size: item.resource.bytes.byteLength,
        });

        if (rejection) {
          failures.push({
            kind: "attachment",
            name: item.resource.fileName,
            message: rejection,
          });
          body = stripAttachmentRefs(body, item.attachmentId);
          stripped = true;
          continue;
        }

        try {
          await uploadAttachment(client, {
            noteId: created.id,
            id: item.attachmentId,
            file: new File([item.resource.bytes.slice()], item.resource.fileName, {
              type: item.resource.mimeType,
            }),
          });
          attachments += 1;
        } catch (error) {
          failures.push({
            kind: "attachment",
            name: item.resource.fileName,
            message: toMessage(error),
          });
          body = stripAttachmentRefs(body, item.attachmentId);
          stripped = true;
        }
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

interface PlannedFiles {
  ids: Map<string, string>;
  files: Array<{ resource: JoplinResource; attachmentId: string }>;
  missing: string[];
}

function planNoteResources(
  resourceIds: string[],
  resources: Map<string, JoplinResource>,
  newId: () => string
): PlannedFiles {
  const ids = new Map<string, string>();
  const files: Array<{ resource: JoplinResource; attachmentId: string }> = [];
  const missing: string[] = [];

  for (const id of resourceIds) {
    const resource = resources.get(id);
    if (!resource) {
      missing.push(id);
      continue;
    }

    const attachmentId = newId();
    ids.set(id, attachmentId);
    files.push({ resource, attachmentId });
  }

  return { ids, files, missing };
}
