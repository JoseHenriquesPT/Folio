import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "../auth/session";
import { useSupabase, useSupabaseEnv } from "../db/SupabaseProvider";
import {
  getAttachmentUsage,
  type AttachmentUsage,
} from "../db/attachments";
import { getProfile, updateDisplayName } from "../db/profiles";
import { formatBytes } from "../lib/attachments";
import { toMessage } from "../lib/errors";
import { type ThemeMode, useTheme } from "../lib/theme";
import { displayName } from "../lib/user";
import { useToast } from "../components/ToastProvider";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function SettingsPage() {
  const session = useSession();
  const client = useSupabase();
  const { storageLimitBytes } = useSupabaseEnv();
  const toast = useToast();
  const { mode, setMode } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [name, setName] = useState(displayName(session));
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AttachmentUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const email = session.user.email ?? "";

  useEffect(() => {
    let active = true;
    getAttachmentUsage(client)
      .then((totals) => {
        if (active) setUsage(totals);
      })
      .catch((nextError: unknown) => {
        if (active) setUsageError(toMessage(nextError));
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    let active = true;
    getProfile(client, session.user.id)
      .then((profile) => {
        if (active && profile) setName(profile.display_name || displayName(session));
      })
      .catch(() => {
        /* The auth metadata name is a fine fallback. */
      });
    return () => {
      active = false;
    };
  }, [client, session]);

  async function signOut() {
    setSigningOut(true);
    try {
      await client.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next) {
      setNameError("A display name is required.");
      return;
    }

    setSavingName(true);
    setNameError(null);
    try {
      await updateDisplayName(client, session.user.id, next);
      await client.auth.updateUser({ data: { full_name: next } });
      toast.push("Display name updated.", "success");
    } catch (nextError) {
      setNameError(toMessage(nextError));
    } finally {
      setSavingName(false);
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
          <form className="settings-form" onSubmit={saveName}>
            <label htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
            {nameError ? (
              <p className="form-error" role="alert">
                {nameError}
              </p>
            ) : null}
            <button
              type="submit"
              className="button small"
              disabled={savingName || !name.trim()}
            >
              {savingName ? "Saving..." : "Save name"}
            </button>
          </form>

          <dl className="facts">
            <div>
              <dt>Email</dt>
              <dd>{email || "Not available"}</dd>
            </div>
          </dl>

          <button
            type="button"
            className="button ghost"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </section>

        <section className="card" aria-labelledby="storage-title">
          <h2 id="storage-title">Attachments</h2>
          {usageError ? (
            <p className="form-error" role="alert">
              {usageError}
            </p>
          ) : usage ? (
            <>
              <p className="muted">
                {formatBytes(usage.totalBytes)} of{" "}
                {formatBytes(storageLimitBytes)} used across{" "}
                {usage.attachmentCount}{" "}
                {usage.attachmentCount === 1 ? "file" : "files"}.
              </p>
              <div
                className="storage-meter"
                role="img"
                aria-label={`${Math.min(
                  100,
                  Math.round((usage.totalBytes / storageLimitBytes) * 100)
                )}% of the attachment budget used`}
              >
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      (usage.totalBytes / storageLimitBytes) * 100
                    )}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <span className="skeleton-line" />
          )}
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
