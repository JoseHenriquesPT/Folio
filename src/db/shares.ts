import type { DbClient } from "./supabase";
import type { NoteShareRow } from "./database.types";

export type NoteShare = NoteShareRow;
export type SharePermission = NoteShareRow["permission"];

export interface ShareInput {
  noteId: string;
  sharedWith: string;
  permission: SharePermission;
}

export async function listShares(
  client: DbClient,
  noteId: string
): Promise<NoteShare[]> {
  const { data, error } = await client
    .from("note_shares")
    .select("*")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function shareNote(
  client: DbClient,
  input: ShareInput
): Promise<NoteShare> {
  const { data, error } = await client
    .from("note_shares")
    .upsert(
      {
        note_id: input.noteId,
        shared_with: input.sharedWith,
        permission: input.permission,
      },
      { onConflict: "note_id,shared_with" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function setSharePermission(
  client: DbClient,
  shareId: string,
  permission: SharePermission
): Promise<NoteShare> {
  const { data, error } = await client
    .from("note_shares")
    .update({ permission })
    .eq("id", shareId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function revokeShare(
  client: DbClient,
  shareId: string
): Promise<void> {
  const { error } = await client
    .from("note_shares")
    .delete()
    .eq("id", shareId);

  if (error) throw error;
}
