import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession must be used inside an authenticated view");
  }
  return session;
}
