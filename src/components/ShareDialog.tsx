import { useEffect, useReducer, useState, type FormEvent } from "react";
import { useSupabase } from "../db/SupabaseProvider";
import { findProfileByEmail, listProfilesByIds } from "../db/profiles";
import {
  listNotebookShares,
  revokeNotebookShare,
  setNotebookSharePermission,
  shareNotebook,
} from "../db/notebookShares";
import {
  listShares,
  revokeShare,
  setSharePermission,
  shareNote,
  type SharePermission,
} from "../db/shares";
import type { DbClient } from "../db/supabase";
import { toMessage } from "../lib/errors";
import {
  normalizeEmail,
  permissionLabel,
  reduceShares,
  validateShareTarget,
  type ShareRecipient,
} from "../lib/shares";
import { useConfirm } from "./ConfirmProvider";
import Modal from "./Modal";
import { useToast } from "./ToastProvider";

export type ShareKind = "note" | "notebook";

interface ShareDialogProps {
  open: boolean;
  kind: ShareKind;
  targetId: string;
  ownerId: string;
  currentUserId: string;
  version: number;
  onClose: () => void;
  onChanged: () => void;
}

interface ShareRow {
  id: string;
  shared_with: string;
  permission: SharePermission;
}

interface ShareApi {
  list(client: DbClient, targetId: string): Promise<ShareRow[]>;
  create(
    client: DbClient,
    targetId: string,
    sharedWith: string,
    permission: SharePermission
  ): Promise<ShareRow>;
  update(
    client: DbClient,
    shareId: string,
    permission: SharePermission
  ): Promise<ShareRow>;
  revoke(client: DbClient, shareId: string): Promise<void>;
}

const NOTE_API: ShareApi = {
  list: (client, targetId) => listShares(client, targetId),
  create: (client, targetId, sharedWith, permission) =>
    shareNote(client, { noteId: targetId, sharedWith, permission }),
  update: (client, shareId, permission) =>
    setSharePermission(client, shareId, permission),
  revoke: (client, shareId) => revokeShare(client, shareId),
};

const NOTEBOOK_API: ShareApi = {
  list: (client, targetId) => listNotebookShares(client, targetId),
  create: (client, targetId, sharedWith, permission) =>
    shareNotebook(client, { notebookId: targetId, sharedWith, permission }),
  update: (client, shareId, permission) =>
    setNotebookSharePermission(client, shareId, permission),
  revoke: (client, shareId) => revokeNotebookShare(client, shareId),
};

const COPY = {
  note: {
    title: "Share note",
    intro:
      "Add an account by its exact email address. Sharing is per note, and private by default.",
    empty: "Only you can open this note.",
    noun: "note",
  },
  notebook: {
    title: "Share notebook",
    intro:
      "Add an account by its exact email address. They can open this notebook, its sub-notebooks, and every note in them.",
    empty: "Only you can open this notebook.",
    noun: "notebook",
  },
} as const;

const PERMISSIONS: SharePermission[] = ["read", "edit"];

export default function ShareDialog({
  open,
  kind,
  targetId,
  ownerId,
  currentUserId,
  version,
  onClose,
  onChanged,
}: ShareDialogProps) {
  const client = useSupabase();
  const toast = useToast();
  const confirm = useConfirm();
  const [recipients, dispatch] = useReducer(reduceShares, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<SharePermission>("read");
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const api = kind === "note" ? NOTE_API : NOTEBOOK_API;
  const copy = COPY[kind];

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPermission("read");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoading(true);
    setError(null);

    api
      .list(client, targetId)
      .then(async (shares) => {
        const profiles = await listProfilesByIds(
          client,
          shares.map((share) => share.shared_with)
        );
        if (!active) return;

        const names = new Map(
          profiles.map((profile) => [profile.id, profile.display_name])
        );
        dispatch({
          type: "load",
          recipients: shares.map((share) => ({
            shareId: share.id,
            userId: share.shared_with,
            displayName: names.get(share.shared_with) || "Folio user",
            permission: share.permission,
          })),
        });
      })
      .catch((nextError: unknown) => {
        if (active) setError(toMessage(nextError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, client, targetId, open, version]);

  async function addRecipient(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const target = await findProfileByEmail(
        client,
        normalizeEmail(email)
      );
      const message = validateShareTarget({
        email,
        targetId: target?.id ?? null,
        ownerId,
        currentUserId,
        kind: copy.noun,
      });
      if (message) {
        setError(message);
        return;
      }

      const existing = recipients.find(
        (recipient) => recipient.userId === target?.id
      );
      if (existing) {
        if (existing.permission === permission) {
          toast.push("That account already has this permission.", "info");
          return;
        }
        const updated = await api.update(
          client,
          existing.shareId,
          permission
        );
        dispatch({
          type: "update",
          shareId: updated.id,
          permission: updated.permission,
        });
        toast.push("Permission updated.", "success");
        onChanged();
      } else {
        const created = await api.create(
          client,
          targetId,
          target!.id,
          permission
        );
        dispatch({
          type: "add",
          recipient: {
            shareId: created.id,
            userId: created.shared_with,
            displayName: target!.display_name || "Folio user",
            permission: created.permission,
          },
        });
        toast.push(
          `Shared with ${target!.display_name || "that account"}.`,
          "success"
        );
        onChanged();
      }
      setEmail("");
    } catch (nextError) {
      setError(toMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function changePermission(
    recipient: ShareRecipient,
    next: SharePermission
  ) {
    setSavingId(recipient.shareId);
    try {
      const updated = await api.update(client, recipient.shareId, next);
      dispatch({
        type: "update",
        shareId: updated.id,
        permission: updated.permission,
      });
      toast.push("Permission updated.", "success");
      onChanged();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setSavingId(null);
    }
  }

  async function removeRecipient(recipient: ShareRecipient) {
    const accepted = await confirm({
      title: "Remove access",
      message: `Remove ${recipient.displayName}'s access to this ${copy.noun}?`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!accepted) return;

    setSavingId(recipient.shareId);
    try {
      await api.revoke(client, recipient.shareId);
      dispatch({ type: "revoke", shareId: recipient.shareId });
      toast.push("Access removed.", "success");
      onChanged();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Modal open={open} title={copy.title} onClose={onClose}>
      <p className="muted share-intro">{copy.intro}</p>

      <form className="inline-form share-form" onSubmit={addRecipient}>
        <label className="sr-only" htmlFor="share-email">
          Recipient email
        </label>
        <input
          id="share-email"
          type="email"
          value={email}
          placeholder="name@example.com"
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
        <label className="sr-only" htmlFor="share-permission">
          Permission
        </label>
        <select
          id="share-permission"
          value={permission}
          onChange={(event) =>
            setPermission(event.target.value as SharePermission)
          }
          disabled={busy}
        >
          {PERMISSIONS.map((value) => (
            <option key={value} value={value}>
              {permissionLabel(value)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="button primary"
          disabled={busy || !email.trim()}
        >
          {busy ? "Sharing…" : "Share"}
        </button>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <h3 className="share-list-title">People with access</h3>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : recipients.length === 0 ? (
          <p className="muted">{copy.empty}</p>
        ) : (
          <ul className="manage-list">
            {recipients.map((recipient) => (
              <li className="manage-row" key={recipient.shareId}>
                <span className="manage-name">{recipient.displayName}</span>
                <div className="manage-actions">
                  <label className="sr-only" htmlFor={`share-perm-${recipient.shareId}`}>
                    Permission for {recipient.displayName}
                  </label>
                  <select
                    id={`share-perm-${recipient.shareId}`}
                    value={recipient.permission}
                    disabled={savingId === recipient.shareId}
                    onChange={(event) =>
                      void changePermission(
                        recipient,
                        event.target.value as SharePermission
                      )
                    }
                  >
                    {PERMISSIONS.map((value) => (
                      <option key={value} value={value}>
                        {permissionLabel(value)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button small ghost danger-text"
                    disabled={savingId === recipient.shareId}
                    onClick={() => void removeRecipient(recipient)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
