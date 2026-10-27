import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../lib/env";
import type { Database } from "./database.types";

export type DbClient = SupabaseClient<Database>;

export function createSupabaseClient(env: AppEnv): DbClient {
  return createClient<Database>(env.supabaseUrl, env.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
}
