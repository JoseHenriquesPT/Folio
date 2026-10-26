import type { AppEnv } from "../lib/env";

export type AuthProviders = {
  google: boolean;
};

type SettingsResponse = {
  external?: {
    google?: boolean;
  };
};

export async function fetchAuthProviders(
  env: AppEnv,
  fetchImpl: typeof fetch = fetch
): Promise<AuthProviders> {
  const response = await fetchImpl(`${env.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: env.supabaseKey },
  });

  if (!response.ok) {
    throw new Error("Could not load sign-in providers.");
  }

  const settings = (await response.json()) as SettingsResponse;
  return { google: settings.external?.google === true };
}
