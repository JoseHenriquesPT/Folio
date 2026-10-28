import type { DbClient } from "./supabase";
import type { ProfileRow, PublicProfileRow } from "./database.types";

export type Profile = ProfileRow;
export type PublicProfile = PublicProfileRow;

export async function getProfile(
  client: DbClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateDisplayName(
  client: DbClient,
  userId: string,
  displayName: string
): Promise<Profile> {
  const { data, error } = await client
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listPublicProfiles(
  client: DbClient
): Promise<PublicProfile[]> {
  const { data, error } = await client
    .from("public_profiles")
    .select("*")
    .order("display_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getPublicProfile(
  client: DbClient,
  userId: string
): Promise<PublicProfile | null> {
  const { data, error } = await client
    .from("public_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listProfilesByIds(
  client: DbClient,
  userIds: string[]
): Promise<PublicProfile[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await client
    .from("public_profiles")
    .select("*")
    .in("id", userIds);

  if (error) throw error;
  return data ?? [];
}

export async function findProfileByEmail(
  client: DbClient,
  email: string
): Promise<PublicProfile | null> {
  const { data, error } = await client.rpc("find_profile_by_email", {
    candidate_email: email,
  });

  if (error) throw error;
  return data?.[0] ?? null;
}
