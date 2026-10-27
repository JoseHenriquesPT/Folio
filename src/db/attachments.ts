import type { DbClient } from "./supabase";
import type { AttachmentRow } from "./database.types";

export type Attachment = AttachmentRow;

export const ATTACHMENT_BUCKET = "note-attachments";
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const DEFAULT_SIGNED_URL_SECONDS = 60 * 60;

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

export async function createDownloadUrl(
  client: DbClient,
  storagePath: string,
  expiresIn = DEFAULT_SIGNED_URL_SECONDS
): Promise<string> {
  const { data, error } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) throw error;
  return data.signedUrl;
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
