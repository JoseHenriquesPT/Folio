import type { ImportFormat } from "./importFormat";
import type { JoplinImportPlan } from "./joplin";

export type ImportRootLabel = "Joplin" | "Folio";

export interface ImportNotebook {
  id: string;
  title: string;
  parentId: string | null;
}

export interface ImportNote {
  id: string;
  title: string;
  bodyHtml: string;
  notebookId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  archived: boolean;
  tags: string[];
  /** Source attachment ids, used to rewrite `attachment:` refs while writing. */
  attachmentIds: string[];
}

export interface ImportAttachment {
  id: string;
  /** Used to derive a JSON storage path; null when the bytes travel with the plan. */
  sourceNoteId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Present when the source carries the bytes (vault zip or Joplin JEX). */
  bytes?: Uint8Array;
}

export interface ImportSkip {
  path: string;
  reason: string;
}

export interface ImportCounts {
  notes: number;
  notebooks: number;
  attachments: number;
  tags: number;
  skipped: number;
  linksRewritten: number;
}

export interface ImportPlan {
  source: ImportFormat;
  rootLabel: ImportRootLabel;
  notebooks: ImportNotebook[];
  notes: ImportNote[];
  attachments: ImportAttachment[];
  skipped: ImportSkip[];
  warnings: string[];
  counts: ImportCounts;
}

export function importRootName(label: ImportRootLabel, now: Date): string {
  return `Imported from ${label} — ${now.toISOString().slice(0, 10)}`;
}

function notebookDepth(
  notebooks: Map<string, ImportNotebook>,
  id: string
): number {
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

/** Parents must be created before children; sibling order stays as received. */
export function orderNotebooks(notebooks: ImportNotebook[]): ImportNotebook[] {
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));

  return [...notebooks].sort(
    (left, right) => notebookDepth(byId, left.id) - notebookDepth(byId, right.id)
  );
}

export function planFromJoplin(plan: JoplinImportPlan): ImportPlan {
  const attachments: ImportAttachment[] = plan.resources.map((resource) => ({
    id: resource.id,
    sourceNoteId: null,
    fileName: resource.fileName,
    mimeType: resource.mimeType,
    sizeBytes: resource.bytes.byteLength,
    bytes: resource.bytes,
  }));

  return {
    source: "joplin",
    rootLabel: "Joplin",
    notebooks: plan.notebooks.map((notebook) => ({
      id: notebook.id,
      title: notebook.title,
      parentId: notebook.parentId,
    })),
    notes: plan.notes.map((note) => ({
      id: note.id,
      title: note.title,
      bodyHtml: note.bodyHtml,
      notebookId: note.notebookId,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      archived: false,
      tags: [],
      attachmentIds: note.resourceIds,
    })),
    attachments,
    skipped: plan.skipped,
    warnings: plan.warnings,
    counts: {
      notes: plan.counts.notes,
      notebooks: plan.counts.notebooks,
      attachments: plan.counts.resources,
      tags: 0,
      skipped: plan.counts.skipped,
      linksRewritten: plan.counts.rewrittenLinks,
    },
  };
}
