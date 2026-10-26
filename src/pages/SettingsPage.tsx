import { useState } from "react";
import { useSession } from "../auth/session";
import { useSupabase } from "../db/SupabaseProvider";
import { type ThemeMode, useTheme } from "../lib/theme";
import { displayName } from "../lib/user";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function SettingsPage() {
  const session = useSession();
  const client = useSupabase();
  const { mode, setMode } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const name = displayName(session);
  const email = session.user.email ?? "";

  async function signOut() {
    setSigningOut(true);
    try {
      await client.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Account &amp; appearance</h1>
        <p className="muted">A small set of choices, kept out of the way.</p>
      </header>

      <div className="settings-grid">
        <section className="card" aria-labelledby="appearance-title">
          <h2 id="appearance-title">Appearance</h2>
          <p className="muted">Folio follows your device unless you choose otherwise.</p>
          <div className="segmented" role="group" aria-label="Theme">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={mode === option.value ? "active" : ""}
                aria-pressed={mode === option.value}
                onClick={() => setMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="account-title">
          <h2 id="account-title">Account</h2>
          <dl className="facts">
            {name !== email ? (
              <div>
                <dt>Name</dt>
                <dd>{name}</dd>
              </div>
            ) : null}
            <div>
              <dt>Email</dt>
              <dd>{email || "Not available"}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="button ghost"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </section>

        <section className="card" aria-labelledby="data-title">
          <h2 id="data-title">Data</h2>
          <p className="muted">
            Export and import controls will live here. Nothing leaves Folio without
            your action.
          </p>
        </section>
      </div>
    </section>
  );
}
