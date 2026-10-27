import type { DbClient } from "./supabase";
import type { TagRow, TagSummaryRow } from "./database.types";

export type Tag = TagRow;
export type TagSummary = TagSummaryRow;

export interface NewTag {
  name: string;
  color?: string | null;
}

export async function listTagsWithCounts(
  client: DbClient
): Promise<TagSummary[]> {
  const { data, error } = await client
    .from("tag_summaries")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTag(
  client: DbClient,
  input: NewTag
): Promise<Tag> {
  const { data, error } = await client
    .from("tags")
    .insert({ name: input.name, color: input.color ?? null })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function renameTag(
  client: DbClient,
  tagId: string,
  name: string
): Promise<Tag> {
  const { data, error } = await client
    .from("tags")
    .update({ name })
    .eq("id", tagId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTag(
  client: DbClient,
  tagId: string
): Promise<void> {
  const { error } = await client.from("tags").delete().eq("id", tagId);
  if (error) throw error;
}

export async function attachTag(
  client: DbClient,
  noteId: string,
  tagId: string
): Promise<void> {
  const { error } = await client
    .from("note_tags")
    .insert({ note_id: noteId, tag_id: tagId });

  if (error) throw error;
}

export async function detachTag(
  client: DbClient,
  noteId: string,
  tagId: string
): Promise<void> {
  const { error } = await client
    .from("note_tags")
    .delete()
    .eq("note_id", noteId)
    .eq("tag_id", tagId);

  if (error) throw error;
}

export async function listNoteTags(
  client: DbClient,
  noteId: string
): Promise<Tag[]> {
  const { data: links, error: linkError } = await client
    .from("note_tags")
    .select("tag_id")
    .eq("note_id", noteId);

  if (linkError) throw linkError;

  const tagIds = (links ?? []).map((link) => link.tag_id);
  if (tagIds.length === 0) return [];

  const { data, error } = await client
    .from("tags")
    .select("*")
    .in("id", tagIds)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
