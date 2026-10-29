import type { DbClient } from "./supabase";
import type { AttachmentRow } from "./database.types";
import { SIGNED_URL_SECONDS } from "../lib/attachments";

export type Attachment = AttachmentRow;

export const ATTACHMENT_BUCKET = "note-attachments";

export interface NewAttachment {
  id?: string;
  noteId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function attachmentExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return "bin";

  const extension = trimmed
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);

  return extension || "bin";
}

export function buildAttachmentPath(
  noteId: string,
  attachmentId: string,
  fileName: string
): string {
  return `${noteId}/${attachmentId}.${attachmentExtension(fileName)}`;
}

export function newAttachmentId(): string {
  return globalThis.crypto.randomUUID();
}

export async function listAttachments(
  client: DbClient,
  noteId: string
): Promise<Attachment[]> {
  const { data, error } = await client
    .from("attachments")
    .select("*")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createAttachment(
  client: DbClient,
  input: NewAttachment
): Promise<Attachment> {
  const id = input.id ?? newAttachmentId();
  const { data, error } = await client
    .from("attachments")
    .insert({
      id,
      note_id: input.noteId,
      storage_path: buildAttachmentPath(input.noteId, id, input.fileName),
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAttachment(
  client: DbClient,
  attachmentId: string
): Promise<void> {
  const { error } = await client
    .from("attachments")
    .delete()
    .eq("id", attachmentId);

  if (error) throw error;
}

export interface UploadAttachmentInput {
  noteId: string;
  file: File;
  id?: string;
}

/**
 * Writes the metadata row first so the storage policy can be checked against a
 * real attachment, then uploads the bytes. A failed upload rolls the row back.
 */
export async function uploadAttachment(
  client: DbClient,
  input: UploadAttachmentInput
): Promise<Attachment> {
  const created = await createAttachment(client, {
    id: input.id,
    noteId: input.noteId,
    fileName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    sizeBytes: input.file.size,
  });

  try {
    await uploadAttachmentObject(client, created.storage_path, input.file);
  } catch (error) {
    try {
      await deleteAttachment(client, created.id);
    } catch {
      /* The upload error is the useful one; a stale row can be retried. */
    }
    throw error;
  }

  return created;
}

export async function createSignedUrls(
  client: DbClient,
  storagePaths: string[],
  expiresIn = SIGNED_URL_SECONDS
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (storagePaths.length === 0) return urls;

  const { data, error } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(storagePaths, expiresIn);

  if (error) throw error;

  for (const item of data ?? []) {
    if (!item.error && item.path && item.signedUrl) {
      urls.set(item.path, item.signedUrl);
    }
  }

  return urls;
}

export interface DownloadUrlOptions {
  expiresIn?: number;
  downloadName?: string;
}

export async function createDownloadUrl(
  client: DbClient,
  storagePath: string,
  options: DownloadUrlOptions = {}
): Promise<string> {
  const bucket = client.storage.from(ATTACHMENT_BUCKET);
  const expiresIn = options.expiresIn ?? SIGNED_URL_SECONDS;
  const { data, error } = options.downloadName
    ? await bucket.createSignedUrl(storagePath, expiresIn, {
        download: options.downloadName,
      })
    : await bucket.createSignedUrl(storagePath, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

export interface AttachmentUsage {
  totalBytes: number;
  attachmentCount: number;
}

export async function getAttachmentUsage(
  client: DbClient
): Promise<AttachmentUsage> {
  const { data, error } = await client.rpc("attachment_usage").single();

  if (error) throw error;
  return {
    totalBytes: data.total_bytes,
    attachmentCount: data.attachment_count,
  };
}

export async function uploadAttachmentObject(
  client: DbClient,
  storagePath: string,
  file: File
): Promise<void> {
  const { error } = await client.storage.from(ATTACHMENT_BUCKET).upload(
    storagePath,
    file,
    {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    }
  );

  if (error) throw error;
}

export async function removeAttachmentObject(
  client: DbClient,
  storagePaths: string[]
): Promise<void> {
  const { error } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .remove(storagePaths);

  if (error) throw error;
}

/**
 * Drops a note's stored files ahead of a permanent delete; the attachment
 * rows leave with the note itself. Returns how many files were removed.
 */
export async function removeAttachmentsForNote(
  client: DbClient,
  noteId: string
): Promise<number> {
  const rows = await listAttachments(client, noteId);
  if (rows.length === 0) return 0;

  await removeAttachmentObject(
    client,
    rows.map((row) => row.storage_path)
  );
  return rows.length;
}
