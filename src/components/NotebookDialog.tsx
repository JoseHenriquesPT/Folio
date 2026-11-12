import { useMemo, useState, type FormEvent } from "react";
import { useSession } from "../auth/session";
import { useSupabase } from "../db/SupabaseProvider";
import {
  createNotebook,
  deleteNotebook,
  moveNotebook,
  renameNotebook,
  type Notebook,
} from "../db/notebooks";
import { toMessage } from "../lib/errors";
import {
  buildNotebookTree,
  flattenNotebookTree,
  notebookDescendantIds,
  ownedNotebooks,
} from "../lib/notebooks";
import { notebookBadges } from "../lib/notebookShares";
import { useConfirm } from "./ConfirmProvider";
import Modal from "./Modal";
import ShareDialog from "./ShareDialog";
import { useToast } from "./ToastProvider";
import { useWorkspace } from "./WorkspaceProvider";

function nextPosition(notebooks: Notebook[], parentId: string | null): number {
  const siblings = notebooks.filter(
    (notebook) => (notebook.parent_id ?? null) === parentId
  );
  return siblings.reduce((max, notebook) => Math.max(max, notebook.position), -1) + 1;
}

export default function NotebookDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const client = useSupabase();
  const session = useSession();
  const userId = session.user.id;
  const toast = useToast();
  const confirm = useConfirm();
  const {
    notebooks,
    notebookShares,
    sharedOwnerNames,
    refreshNotebooks,
  } = useWorkspace();
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareTarget, setShareTarget] = useState<Notebook | null>(null);
  const [shareVersion, setShareVersion] = useState(0);

  const rows = useMemo(
    () => flattenNotebookTree(buildNotebookTree(notebooks)),
    [notebooks]
  );
  const badges = useMemo(
    () => notebookBadges(notebooks, notebookShares, userId, sharedOwnerNames),
    [notebooks, notebookShares, sharedOwnerNames, userId]
  );

  function parentOptions(excludeId?: string): Notebook[] {
    const owned = ownedNotebooks(notebooks, userId);
    if (!excludeId) return owned;
    const excluded = notebookDescendantIds(notebooks, excludeId);
    return owned.filter((notebook) => !excluded.has(notebook.id));
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setBusy(true);
    try {
      await createNotebook(client, {
        name,
        parentId: newParentId || null,
        position: nextPosition(notebooks, newParentId || null),
      });
      setNewName("");
      await refreshNotebooks();
      toast.push("Notebook created.", "success");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(notebook: Notebook) {
    const name = editName.trim();
    if (!name) return;

    setBusy(true);
    try {
      await renameNotebook(client, notebook.id, name);
      setEditingId(null);
      await refreshNotebooks();
      toast.push("Notebook renamed.", "success");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(notebook: Notebook, parentId: string | null) {
    setBusy(true);
    try {
      await moveNotebook(client, notebook.id, parentId);
      await refreshNotebooks();
      toast.push("Notebook moved.", "success");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(notebook: Notebook) {
    const accepted = await confirm({
      title: "Delete notebook",
      message: `Delete “${notebook.name}”? Its notes will move to Unfiled; child notebooks will become top-level.`,
      confirmLabel: "Delete notebook",
      tone: "danger",
    });
    if (!accepted) return;

    setBusy(true);
    try {
      await deleteNotebook(client, notebook.id);
      await refreshNotebooks();
      toast.push("Notebook deleted; notes moved to Unfiled.", "success");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Manage notebooks" onClose={onClose}>
      <form className="inline-form" onSubmit={handleCreate}>
        <input
          value={newName}
          placeholder="New notebook"
          aria-label="New notebook name"
          onChange={(event) => setNewName(event.target.value)}
        />
        <select
          value={newParentId}
          aria-label="Parent notebook"
          onChange={(event) => setNewParentId(event.target.value)}
        >
          <option value="">Top level</option>
          {parentOptions().map((notebook) => (
            <option key={notebook.id} value={notebook.id}>
              {notebook.name}
            </option>
          ))}
        </select>
        <button type="submit" className="button small primary" disabled={busy || !newName.trim()}>
          Add
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="muted">No notebooks yet.</p>
      ) : (
        <ul className="manage-list">
          {rows.map(({ node, depth }) => {
            const owned = node.owner_id === userId;
            const badge = badges.get(node.id);
            return (
              <li key={node.id} className="manage-row">
                <div className="manage-name" style={{ paddingLeft: `${depth * 16}px` }}>
                  {editingId === node.id ? (
                    <input
                      value={editName}
                      aria-label={`Rename ${node.name}`}
                      onChange={(event) => setEditName(event.target.value)}
                      autoFocus
                    />
                  ) : (
                    <span>{node.name}</span>
                  )}
                  {badge ? (
                    <span className="badge share" title={badge.title}>
                      {badge.label}
                    </span>
                  ) : null}
                </div>

                <div className="manage-actions">
                  {!owned ? null : editingId === node.id ? (
                    <>
                      <button
                        type="button"
                        className="button small primary"
                        disabled={busy || !editName.trim()}
                        onClick={() => void handleRename(node)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="button small ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button small ghost"
                        onClick={() => setShareTarget(node)}
                      >
                        Share
                      </button>

                      <button
                        type="button"
                        className="button small ghost"
                        onClick={() => {
                          setEditingId(node.id);
                          setEditName(node.name);
                        }}
                      >
                        Rename
                      </button>

                      <select
                        value={node.parent_id ?? ""}
                        aria-label={`Move ${node.name}`}
                        disabled={busy}
                        onChange={(event) =>
                          void handleMove(node, event.target.value || null)
                        }
                      >
                        <option value="">Top level</option>
                        {parentOptions(node.id).map((notebook) => (
                          <option key={notebook.id} value={notebook.id}>
                            {notebook.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="button small ghost danger-text"
                        disabled={busy}
                        onClick={() => void handleDelete(node)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ShareDialog
        open={shareTarget !== null}
        kind="notebook"
        targetId={shareTarget?.id ?? ""}
        ownerId={shareTarget?.owner_id ?? ""}
        currentUserId={userId}
        version={shareVersion}
        onClose={() => setShareTarget(null)}
        onChanged={() => {
          setShareVersion((value) => value + 1);
          void refreshNotebooks();
        }}
      />
    </Modal>
  );
}
