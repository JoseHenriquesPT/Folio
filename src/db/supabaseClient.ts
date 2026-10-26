import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../lib/env";

export function createSupabaseClient(env: AppEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
}
