import type { DbClient } from "./supabase";
import type { Json } from "./database.types";

export interface ApiAuditEntry {
  id: number;
  tool: string;
  status: string;
  noteIds: string[];
  noteTitles: string[];
  summary: Json;
  tokenName: string | null;
  tokenPrefix: string | null;
  createdAt: string;
  canUndo: boolean;
}

export async function listApiAudit(
  client: DbClient,
  limit = 50
): Promise<ApiAuditEntry[]> {
  const { data, error } = await client.rpc("list_api_audit", {
    p_limit: limit,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    tool: row.tool,
    status: row.status,
    noteIds: row.note_ids,
    noteTitles: row.note_titles,
    summary: row.summary,
    tokenName: row.token_name,
    tokenPrefix: row.token_prefix,
    createdAt: row.created_at,
    canUndo: row.can_undo,
  }));
}

export async function undoApiUpdate(
  client: DbClient,
  auditId: number
): Promise<Json> {
  const { data, error } = await client.rpc("undo_api_update", {
    p_audit_id: auditId,
  });
  if (error) throw error;
  return data;
}
