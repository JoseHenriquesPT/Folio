import type { DbClient } from "./supabase";
import type { ProfileRow, PublicProfileRow } from "./database.types";

/** The columns the API roles can read on profiles: never email. */
export type Profile = Pick<ProfileRow, "id" | "display_name">;
export type PublicProfile = PublicProfileRow;

export async function getProfile(
  client: DbClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name")
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
    .select("id, display_name")
    .single();

  if (error) throw error;
  return data;
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
