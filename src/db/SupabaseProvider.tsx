import { createContext, useContext, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../lib/env";

type SupabaseContextValue = {
  client: SupabaseClient;
  env: AppEnv;
};

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function SupabaseProvider({
  client,
  env,
  children,
}: {
  client: SupabaseClient;
  env: AppEnv;
  children: ReactNode;
}) {
  return (
    <SupabaseContext.Provider value={{ client, env }}>
      {children}
    </SupabaseContext.Provider>
  );
}

function useSupabaseContext(): SupabaseContextValue {
  const value = useContext(SupabaseContext);
  if (!value) {
    throw new Error("Supabase context is missing");
  }
  return value;
}

export function useSupabase(): SupabaseClient {
  return useSupabaseContext().client;
}

export function useSupabaseEnv(): AppEnv {
  return useSupabaseContext().env;
}
