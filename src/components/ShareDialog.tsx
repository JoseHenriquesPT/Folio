import { useEffect, useReducer, useState, type FormEvent } from "react";
import { useSupabase } from "../db/SupabaseProvider";
import { findProfileByEmail, listProfilesByIds } from "../db/profiles";
import {
  listShares,
  revokeShare,
  setSharePermission,
  shareNote,
  type SharePermission,
} from "../db/shares";
import { toMessage } from "../lib/errors";
import {
  normalizeEmail,
  permissionLabel,
  reduceShares,
  validateShareTarget,
  type ShareRecipient,
} from "../lib/shares";
import Modal from "./Modal";
import { useToast } from "./ToastProvider";

interface ShareDialogProps {
  open: boolean;
  noteId: string;
  ownerId: string;
  currentUserId: string;
  version: number;
  onClose: () => void;
  onChanged: () => void;
}

const PERMISSIONS: SharePermission[] = ["read", "edit"];

export default function ShareDialog({
  open,
  noteId,
  ownerId,
  currentUserId,
  version,
  onClose,
  onChanged,
}: ShareDialogProps) {
  const client = useSupabase();
  const toast = useToast();
  const [recipients, dispatch] = useReducer(reduceShares, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<SharePermission>("read");
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

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

    listShares(client, noteId)
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
  }, [client, noteId, open, version]);

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
        const updated = await setSharePermission(
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
        const created = await shareNote(client, {
          noteId,
          sharedWith: target!.id,
          permission,
        });
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
      const updated = await setSharePermission(
        client,
        recipient.shareId,
        next
      );
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
    if (
      !window.confirm(
        `Remove ${recipient.displayName}'s access to this note?`
      )
    ) {
      return;
    }

    setSavingId(recipient.shareId);
    try {
      await revokeShare(client, recipient.shareId);
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
    <Modal open={open} title="Share note" onClose={onClose}>
      <p className="muted share-intro">
        Add an account by its exact email address. Sharing is per note, and
        private by default.
      </p>

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
          <p className="muted">Only you can open this note.</p>
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
