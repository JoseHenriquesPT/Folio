import { createContext, useContext, type ReactNode } from "react";
import type { AppEnv } from "../lib/env";
import type { DbClient } from "./supabase";

type SupabaseContextValue = {
  client: DbClient;
  env: AppEnv;
};

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function SupabaseProvider({
  client,
  env,
  children,
}: {
  client: DbClient;
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

export function useSupabase(): DbClient {
  return useSupabaseContext().client;
}

export function useSupabaseEnv(): AppEnv {
  return useSupabaseContext().env;
}
