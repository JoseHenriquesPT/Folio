import { useMemo, useState, type FormEvent } from "react";
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
} from "../lib/notebooks";
import { useConfirm } from "./ConfirmProvider";
import Modal from "./Modal";
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
  const toast = useToast();
  const confirm = useConfirm();
  const { notebooks, refreshNotebooks } = useWorkspace();
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => flattenNotebookTree(buildNotebookTree(notebooks)),
    [notebooks]
  );

  function parentOptions(excludeId?: string): Notebook[] {
    if (!excludeId) return notebooks;
    const excluded = notebookDescendantIds(notebooks, excludeId);
    return notebooks.filter((notebook) => !excluded.has(notebook.id));
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
          {notebooks.map((notebook) => (
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
          {rows.map(({ node, depth }) => (
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
              </div>

              <div className="manage-actions">
                {editingId === node.id ? (
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
          ))}
        </ul>
      )}
    </Modal>
  );
}
