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
import { useTheme } from "../lib/theme";
import { displayName } from "../lib/user";
import { useToast } from "../components/ToastProvider";
import { useWorkspace } from "../components/WorkspaceProvider";
import ExportPanel from "../components/ExportPanel";
import ImportDialog from "../components/ImportDialog";
import ThemePicker from "../components/ThemePicker";
import { useVaultExport } from "../hooks/useVaultExport";
import { useImport } from "../hooks/useImport";

export default function SettingsPage() {
  const session = useSession();
  const client = useSupabase();
  const { storageLimitBytes } = useSupabaseEnv();
  const toast = useToast();
  const { mode, palette, setMode, setPalette } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [name, setName] = useState(displayName(session));
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AttachmentUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const email = session.user.email ?? "";
  const vaultExport = useVaultExport({
    client,
    ownerId: session.user.id,
    toast,
  });
  const importState = useImport({ client, toast });
  const { refreshNotebooks, refreshTags } = useWorkspace();
  const importResult = importState.result;

  useEffect(() => {
    if (!importResult || importResult.cancelled) return;
    void refreshNotebooks();
    void refreshTags();
  }, [importResult, refreshNotebooks, refreshTags]);

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
          <ThemePicker
            mode={mode}
            palette={palette}
            onModeChange={setMode}
            onPaletteChange={setPalette}
          />
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

        <section className="card" aria-labelledby="export-title">
          <h2 id="export-title">Export</h2>
          <ExportPanel controller={vaultExport} />
        </section>

        <section className="card" aria-labelledby="import-title">
          <h2 id="import-title">Import</h2>
          <p className="muted">
            Bring notes in from a Joplin <code>.jex</code> export, a Folio vault{" "}
            <code>.zip</code>, or a Folio JSON backup. Everything lands in its
            own dated notebook with timestamps, tags and attachments kept, and
            nothing is written until you confirm the preview.
          </p>
          <button
            type="button"
            className="button"
            onClick={() => setImportOpen(true)}
          >
            Import notes
          </button>
          <ImportDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            controller={importState}
          />
        </section>
      </div>
    </section>
  );
}
