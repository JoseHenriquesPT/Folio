import type { DbClient } from "./supabase";
import type { NotebookRow } from "./database.types";

export type Notebook = NotebookRow;

export interface NewNotebook {
  name: string;
  parentId?: string | null;
  position?: number;
}

export async function listNotebooks(client: DbClient): Promise<Notebook[]> {
  const { data, error } = await client
    .from("notebooks")
    .select("*")
    .order("position", { ascending: true })
    .order("name", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createNotebook(
  client: DbClient,
  input: NewNotebook
): Promise<Notebook> {
  const { data, error } = await client
    .from("notebooks")
    .insert({
      name: input.name,
      parent_id: input.parentId ?? null,
      position: input.position ?? 0,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function renameNotebook(
  client: DbClient,
  notebookId: string,
  name: string
): Promise<Notebook> {
  const { data, error } = await client
    .from("notebooks")
    .update({ name })
    .eq("id", notebookId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function moveNotebook(
  client: DbClient,
  notebookId: string,
  parentId: string | null
): Promise<Notebook> {
  const { data, error } = await client
    .from("notebooks")
    .update({ parent_id: parentId })
    .eq("id", notebookId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function reorderNotebook(
  client: DbClient,
  notebookId: string,
  position: number
): Promise<Notebook> {
  const { data, error } = await client
    .from("notebooks")
    .update({ position })
    .eq("id", notebookId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNotebook(
  client: DbClient,
  notebookId: string
): Promise<void> {
  const { error } = await client
    .from("notebooks")
    .delete()
    .eq("id", notebookId);

  if (error) throw error;
}
