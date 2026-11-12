import type { DbClient } from "./supabase";
import type { NotebookShareRow } from "./database.types";

export type NotebookShare = NotebookShareRow;
export type NotebookSharePermission = NotebookShareRow["permission"];

export interface NotebookShareInput {
  notebookId: string;
  sharedWith: string;
  permission: NotebookSharePermission;
}

export async function listNotebookShares(
  client: DbClient,
  notebookId: string
): Promise<NotebookShare[]> {
  const { data, error } = await client
    .from("notebook_shares")
    .select("*")
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NotebookShare[];
}

export async function listVisibleNotebookShares(
  client: DbClient
): Promise<NotebookShare[]> {
  const { data, error } = await client
    .from("notebook_shares")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NotebookShare[];
}

export async function shareNotebook(
  client: DbClient,
  input: NotebookShareInput
): Promise<NotebookShare> {
  const { data, error } = await client
    .from("notebook_shares")
    .upsert(
      {
        notebook_id: input.notebookId,
        shared_with: input.sharedWith,
        permission: input.permission,
      },
      { onConflict: "notebook_id,shared_with" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as NotebookShare;
}

export async function setNotebookSharePermission(
  client: DbClient,
  shareId: string,
  permission: NotebookSharePermission
): Promise<NotebookShare> {
  const { data, error } = await client
    .from("notebook_shares")
    .update({ permission })
    .eq("id", shareId)
    .select("*")
    .single();
  if (error) throw error;
  return data as NotebookShare;
}

export async function revokeNotebookShare(
  client: DbClient,
  shareId: string
): Promise<void> {
  const { error } = await client
    .from("notebook_shares")
    .delete()
    .eq("id", shareId);
  if (error) throw error;
}
