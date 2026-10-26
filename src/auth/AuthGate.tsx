import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useSupabase } from "../db/SupabaseProvider";
import Centered from "../components/Centered";
import { SessionContext } from "./session";
import SignIn from "./SignIn";

export default function AuthGate({ children }: { children: ReactNode }) {
  const client = useSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    client.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setLoading(false);
      });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  if (loading) {
    return (
      <Centered>
        <p className="loading-text" role="status">
          Loading Folio...
        </p>
      </Centered>
    );
  }

  if (!session) {
    return <SignIn />;
  }

  return (
    <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
  );
}
