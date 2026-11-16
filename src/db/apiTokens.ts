import type { DbClient } from "./supabase";
import type { ApiTokenScope } from "../lib/apiTokens";

export type { ApiTokenScope } from "../lib/apiTokens";

export interface ApiTokenSummary {
  id: string;
  name: string;
  prefix: string;
  scope: ApiTokenScope;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  callsToday: number;
}

export interface CreatedApiToken {
  id: string;
  token: string;
  name: string;
  prefix: string;
  scope: ApiTokenScope;
  expiresAt: string;
}

export interface CreateApiTokenInput {
  name: string;
  scope: ApiTokenScope;
  expiresAt: string;
}

export async function canManageApiTokens(client: DbClient): Promise<boolean> {
  const { data, error } = await client.rpc("can_manage_api_tokens");
  if (error) throw error;
  return data === true;
}

export async function listApiTokens(
  client: DbClient
): Promise<ApiTokenSummary[]> {
  const { data, error } = await client.rpc("list_api_tokens");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    callsToday: row.calls_today,
  }));
}

export async function createApiToken(
  client: DbClient,
  input: CreateApiTokenInput
): Promise<CreatedApiToken> {
  const { data, error } = await client.rpc("create_api_token", {
    p_name: input.name.trim(),
    p_scope: input.scope,
    p_expires_at: input.expiresAt,
  });
  if (error) throw error;

  const row = data?.[0];
  if (!row) {
    throw new Error("The token could not be created.");
  }

  return {
    id: row.id,
    token: row.token,
    name: input.name.trim(),
    prefix: row.prefix,
    scope: row.scope,
    expiresAt: row.expires_at,
  };
}

export async function revokeApiToken(
  client: DbClient,
  id: string
): Promise<boolean> {
  const { data, error } = await client.rpc("revoke_api_token", { p_id: id });
  if (error) throw error;
  return data === true;
}
