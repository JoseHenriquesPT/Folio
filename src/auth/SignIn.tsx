import { useEffect, useState, type FormEvent } from "react";
import Brand from "../components/Brand";
import { useSupabase, useSupabaseEnv } from "../db/SupabaseProvider";
import { toMessage } from "../lib/errors";
import { fetchAuthProviders } from "./providers";

type PendingAction = "google" | "email" | null;

export default function SignIn() {
  const client = useSupabase();
  const env = useSupabaseEnv();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    let active = true;

    fetchAuthProviders(env)
      .then((providers) => {
        if (active) setGoogleEnabled(providers.google);
      })
      .catch(() => {
        if (active) setGoogleEnabled(false);
      });

    return () => {
      active = false;
    };
  }, [env]);

  async function signInWithGoogle() {
    setPending("google");
    setError("");
    try {
      const { error: signInError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (signInError) setError(toMessage(signInError));
    } catch (signInError) {
      setError(toMessage(signInError));
    } finally {
      setPending(null);
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;

    setPending("email");
    setError("");
    try {
      const { error: signInError } = await client.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: window.location.origin },
      });
      if (signInError) {
        setError(toMessage(signInError));
      } else {
        setSentTo(address);
      }
    } catch (signInError) {
      setError(toMessage(signInError));
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <Brand />
        <div className="auth-copy">
          <p className="eyebrow">Private notes</p>
          <h1 id="sign-in-title">Sign in to Folio</h1>
          <p className="muted">
            A calm home for your notes. Share a note, never your whole vault.
          </p>
        </div>

        {googleEnabled ? (
          <>
            <button
              type="button"
              className="button google"
              onClick={signInWithGoogle}
              disabled={pending !== null}
            >
              Continue with Google
            </button>

            <div className="divider" aria-hidden="true">
              <span>or</span>
            </div>
          </>
        ) : null}

        {sentTo ? (
          <div className="auth-sent" role="status">
            <h2>Check your inbox</h2>
            <p className="muted">
              We sent a sign-in link to <strong>{sentTo}</strong>.
            </p>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setSentTo(null);
                setError("");
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={sendMagicLink}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending !== null}
              required
            />
            <button
              type="submit"
              className="button primary"
              disabled={pending !== null || !email.trim()}
            >
              {pending === "email" ? "Sending link..." : "Send magic link"}
            </button>
          </form>
        )}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <p className="auth-footnote">New here? Signing in creates your Folio account.</p>
      </section>
    </main>
  );
}
