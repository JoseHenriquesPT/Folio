import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useSupabase } from "../db/SupabaseProvider";
import Centered from "../components/Centered";
import { SessionContext } from "./session";
import SignIn from "./SignIn";

function clearAuthParams() {
  const url = new URL(window.location.href);
  const hasAuthParams =
    url.searchParams.has("code") ||
    url.searchParams.has("error") ||
    url.searchParams.has("error_code");
  const hasHashToken = url.hash.includes("access_token");

  if (hasAuthParams || hasHashToken) {
    url.searchParams.delete("code");
    url.searchParams.delete("error");
    url.searchParams.delete("error_code");
    url.searchParams.delete("error_description");
    if (hasHashToken) url.hash = "";

    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }

  // The auth client cleans its own URL with replaceState, which React Router
  // does not observe. Nudge it to re-read the current location.
  window.dispatchEvent(new PopStateEvent("popstate"));
}

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
        clearAuthParams();
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
      clearAuthParams();
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
