import { abortError } from "../lib/errors";
import type {
  ExportAttachment,
  ExportNote,
  ExportNotebook,
  ExportSource,
} from "../lib/exportPlan";
import { ATTACHMENT_BUCKET } from "./attachments";
import type { AttachmentRow, NoteSummaryRow } from "./database.types";
import { listNotebooks } from "./notebooks";
import type { DbClient } from "./supabase";

export interface ExportAttachmentRecord extends ExportAttachment {
  storagePath: string;
}

export interface ExportData extends ExportSource {
  storagePaths: Map<string, string>;
}

export interface ExportProgress {
  phase: "notes" | "attachments";
  completed: number;
  /**
   * Zero while the total is unknown: PostgREST would need an exact count on
   * every page, and the vault size is discovered as pages arrive.
   */
  total: number;
}

export interface FetchExportOptions {
  ownerId: string;
  pageSize?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

export interface DownloadAttachmentsOptions {
  client: DbClient;
  attachments: Array<Pick<ExportAttachmentRecord, "id" | "fileName" | "storagePath">>;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export const DEFAULT_PAGE_SIZE = 200;
export const DEFAULT_DOWNLOAD_CONCURRENCY = 6;

async function collectPages<T>(
  pageSize: number,
  signal: AbortSignal | undefined,
  load: (from: number, to: number) => Promise<T[]>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  for (;;) {
    if (signal?.aborted) throw abortError();

    const page = await load(from, from + pageSize - 1);
    all.push(...page);

    if (page.length < pageSize) return all;
    from += pageSize;
  }
}

/**
 * Reads everything the current user may export. RLS decides what is visible;
 * the vault planner then drops shared-with-me notes and Trash so the manifest
 * can report honest exclusion counts.
 */
export async function fetchExportData(
  client: DbClient,
  options: FetchExportOptions
): Promise<ExportData> {
  const pageSize = Math.max(1, Math.trunc(options.pageSize ?? DEFAULT_PAGE_SIZE));

  const noteRows = await collectPages<NoteSummaryRow>(
    pageSize,
    options.signal,
    async (from, to) => {
      const { data, error } = await client
        .from("note_summaries")
        .select("*")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);

      if (error) throw error;
      return data ?? [];
    }
  );

  options.onProgress?.({
    phase: "notes",
    completed: noteRows.length,
    total: 0,
  });

  const notebooks = await listNotebooks(client);

  const attachmentRows = await collectPages<AttachmentRow>(
    pageSize,
    options.signal,
    async (from, to) => {
      const { data, error } = await client
        .from("attachments")
        .select("*")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (error) throw error;
      return data ?? [];
    }
  );

  options.onProgress?.({
    phase: "attachments",
    completed: attachmentRows.length,
    total: 0,
  });

  const notes: ExportNote[] = noteRows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    bodyHtml: row.body_html,
    notebookId: row.notebook_id,
    archived: row.archived,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: (row.tags ?? []).map((tag) => tag.name),
  }));

  const exportNotebooks: ExportNotebook[] = notebooks.map((notebook) => ({
    id: notebook.id,
    title: notebook.name,
    parentId: notebook.parent_id,
  }));

  const attachments: ExportAttachment[] = attachmentRows.map((row) => ({
    id: row.id,
    noteId: row.note_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
  }));

  return {
    ownerId: options.ownerId,
    notes,
    notebooks: exportNotebooks,
    attachments,
    storagePaths: new Map(
      attachmentRows.map((row) => [row.id, row.storage_path])
    ),
  };
}

/**
 * Downloads attachment bytes through a small worker pool: enough parallel
 * requests to hide latency, few enough to stay inside the browser's per-host
 * connection budget and the storage gateway's patience.
 */
export async function downloadAttachmentFiles(
  options: DownloadAttachmentsOptions
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const total = options.attachments.length;
  if (total === 0) return files;

  const { signal } = options;
  if (signal?.aborted) throw abortError();

  const bucket = options.client.storage.from(ATTACHMENT_BUCKET);
  const workers = Math.min(
    Math.max(1, Math.trunc(options.concurrency ?? DEFAULT_DOWNLOAD_CONCURRENCY)),
    total
  );

  let next = 0;
  let completed = 0;
  let stopped = false;

  async function worker(): Promise<void> {
    while (!stopped) {
      if (signal?.aborted) {
        stopped = true;
        throw abortError();
      }

      const index = next;
      next += 1;
      if (index >= total) return;

      const attachment = options.attachments[index];
      const { data, error } = await bucket.download(attachment.storagePath);

      if (error) {
        stopped = true;
        throw error;
      }
      if (!data) {
        stopped = true;
        throw new Error(`Could not download ${attachment.fileName}.`);
      }

      files.set(attachment.id, new Uint8Array(await data.arrayBuffer()));
      completed += 1;
      options.onProgress?.(completed, total);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));

  return files;
}
