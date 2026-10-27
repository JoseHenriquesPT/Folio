import { useState, type FormEvent } from "react";
import { useSupabase } from "../db/SupabaseProvider";
import {
  createTag,
  deleteTag,
  renameTag,
} from "../db/tags";
import { toMessage } from "../lib/errors";
import Modal from "./Modal";
import { useToast } from "./ToastProvider";
import { useWorkspace } from "./WorkspaceProvider";

export default function TagDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const client = useSupabase();
  const toast = useToast();
  const { tags, refreshTags } = useWorkspace();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setBusy(true);
    try {
      await createTag(client, { name });
      setNewName("");
      await refreshTags();
      toast.push("Tag created.", "success");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(tagId: string) {
    const name = editName.trim();
    if (!name) return;

    setBusy(true);
    try {
      await renameTag(client, tagId, name);
      setEditingId(null);
      await refreshTags();
      toast.push("Tag renamed.", "success");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(tagId: string, name: string) {
    if (!window.confirm(`Delete the tag “${name}”? It will be removed from every note.`)) {
      return;
    }

    setBusy(true);
    try {
      await deleteTag(client, tagId);
      await refreshTags();
      toast.push("Tag deleted.", "success");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Manage tags" onClose={onClose}>
      <form className="inline-form" onSubmit={handleCreate}>
        <input
          value={newName}
          placeholder="New tag"
          aria-label="New tag name"
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="submit" className="button small primary" disabled={busy || !newName.trim()}>
          Add
        </button>
      </form>

      {tags.length === 0 ? (
        <p className="muted">No tags yet.</p>
      ) : (
        <ul className="manage-list">
          {tags.map((tag) => (
            <li key={tag.id} className="manage-row">
              <div className="manage-name">
                {editingId === tag.id ? (
                  <input
                    value={editName}
                    aria-label={`Rename ${tag.name}`}
                    onChange={(event) => setEditName(event.target.value)}
                    autoFocus
                  />
                ) : (
                  <span>
                    {tag.name}{" "}
                    <span className="tag-count">{tag.note_count}</span>
                  </span>
                )}
              </div>

              <div className="manage-actions">
                {editingId === tag.id ? (
                  <>
                    <button
                      type="button"
                      className="button small primary"
                      disabled={busy || !editName.trim()}
                      onClick={() => void handleRename(tag.id)}
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
                        setEditingId(tag.id);
                        setEditName(tag.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="button small ghost danger-text"
                      disabled={busy}
                      onClick={() => void handleDelete(tag.id, tag.name)}
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
