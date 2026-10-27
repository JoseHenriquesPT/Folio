import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useSession } from "../auth/session";
import { useSupabase } from "../db/SupabaseProvider";
import {
  createNote,
  deleteNotePermanently,
  getNote,
  moveNoteToNotebook,
  restoreNote,
  saveNote,
  setNoteArchived,
  setNotePinned,
  trashNote,
} from "../db/notes";
import {
  getSharePermission,
  type SharePermission,
} from "../db/shares";
import {
  attachTag,
  detachTag,
  listNoteTags,
  type Tag,
  type TagSummary,
} from "../db/tags";
import { useAutosave } from "../hooks/useAutosave";
import { useNote } from "../hooks/useNote";
import { useOnline } from "../hooks/useOnline";
import {
  clearDraft,
  readDraft,
  writeDraft,
  type NoteDraft,
} from "../lib/drafts";
import { toMessage } from "../lib/errors";
import { formatDate, formatRelativeTime } from "../lib/format";
import { editorExtensions } from "../lib/editor";
import { buildNotebookTree, flattenNotebookTree } from "../lib/notebooks";
import { htmlToPlainText, sanitizeHtml } from "../lib/sanitize";
import EditorToolbar from "./EditorToolbar";
import { useToast } from "./ToastProvider";
import { useWorkspace } from "./WorkspaceProvider";

interface NoteEditorProps {
  noteId: string | null;
  initialNotebookId: string | null;
  onCreated: (noteId: string) => void;
  onChanged: () => void;
  onBack: () => void;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function NoteEditor({
  noteId,
  initialNotebookId,
  onCreated,
  onChanged,
  onBack,
}: NoteEditorProps) {
  const session = useSession();
  const userId = session.user.id;
  const client = useSupabase();
  const toast = useToast();
  const online = useOnline();
  const { notebooks, tags: allTags, refreshTags } = useWorkspace();
  const { note, setNote, loading, error, reload } = useNote(noteId);

  const isNew = noteId === null;
  const [title, setTitle] = useState("");
  const [noteTags, setNoteTags] = useState<Tag[]>([]);
  const [notebookId, setNotebookId] = useState<string | null>(
    initialNotebookId
  );
  const [sharePermission, setSharePermission] =
    useState<SharePermission | null>(null);
  const [recovery, setRecovery] = useState<NoteDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(isNew);

  const noteIdRef = useRef<string | null>(noteId);
  const versionRef = useRef(1);
  const titleRef = useRef("");
  const notebookIdRef = useRef<string | null>(initialNotebookId);
  const initializedRef = useRef<string | null>(null);
  const contentRef = useRef("");
  const contentAppliedRef = useRef<string | null>(null);
  const canEditRef = useRef(true);
  const readyRef = useRef(isNew);
  const scheduleRef = useRef<(bodyHtml: string) => void>(() => {});

  const isTrashed = Boolean(note?.deleted_at);
  const isOwner = !note || note.owner_id === userId;
  const canManage = !note || isOwner;
  const canEdit = !note
    ? true
    : !isTrashed && (isOwner || sharePermission === "edit");
  canEditRef.current = canEdit;

  const {
    state,
    change,
    recover,
    retry,
    reset,
    flush,
  } = useAutosave({
    initialVersion: 1,
    save: async (snapshot) => {
      const clean = sanitizeHtml(snapshot.bodyHtml);
      const currentId = noteIdRef.current;

      if (!currentId) {
        if (!snapshot.title.trim() && !htmlToPlainText(clean)) {
          return versionRef.current;
        }

        const created = await createNote(client, {
          title: snapshot.title.trim(),
          bodyHtml: clean,
          notebookId: notebookIdRef.current,
        });
        noteIdRef.current = created.id;
        versionRef.current = created.version;
        const storage = safeStorage();
        if (storage) clearDraft(storage, userId, "new");
        onCreated(created.id);
        return created.version;
      }

      const saved = await saveNote(client, {
        noteId: currentId,
        expectedVersion: versionRef.current,
        title: snapshot.title,
        bodyHtml: clean,
      });
      versionRef.current = saved.version;
      setNote(saved);
      return saved.version;
    },
    onDirty: (snapshot) => {
      const storage = safeStorage();
      if (!storage) return;
      writeDraft(storage, userId, {
        noteId: noteIdRef.current ?? "new",
        title: snapshot.title,
        bodyHtml: snapshot.bodyHtml,
        version: versionRef.current,
        savedAt: new Date().toISOString(),
      });
    },
    onSaved: (_version, pending) => {
      if (!pending) {
        const storage = safeStorage();
        if (storage) {
          clearDraft(storage, userId, noteIdRef.current ?? "new");
        }
      }
      onChanged();
    },
    onError: (kind) => {
      if (kind !== "conflict") {
        toast.push("Save failed. Your draft is still here.", "error");
      }
    },
  });

  const editor = useEditor({
    extensions: editorExtensions,
    content: "",
    editable: canEdit,
    onUpdate: ({ editor: instance }) => {
      if (!canEditRef.current) return;
      scheduleRef.current(instance.getHTML());
    },
  });

  const scheduleSnapshot = useCallback(
    (bodyHtml: string) => {
      if (!readyRef.current || !canEditRef.current) return;
      const snapshot = { title: titleRef.current, bodyHtml };
      if (
        !noteIdRef.current &&
        !snapshot.title.trim() &&
        !htmlToPlainText(bodyHtml)
      ) {
        return;
      }
      change(snapshot);
    },
    [change]
  );
  scheduleRef.current = scheduleSnapshot;

  useEffect(() => {
    if (isNew) {
      if (initializedRef.current === "new") return;
      initializedRef.current = "new";
      noteIdRef.current = null;
      versionRef.current = 1;
      notebookIdRef.current = initialNotebookId;
      setNotebookId(initialNotebookId);
      setTitle("");
      titleRef.current = "";
      setNoteTags([]);
      contentRef.current = "";
      contentAppliedRef.current = null;
      setReady(true);
      readyRef.current = true;
      reset(1);

      const storage = safeStorage();
      setRecovery(storage ? readDraft(storage, userId, "new") : null);
      return;
    }

    if (!note || initializedRef.current === note.id) return;

    initializedRef.current = note.id;
    noteIdRef.current = note.id;
    versionRef.current = note.version;
    notebookIdRef.current = note.notebook_id;
    setNotebookId(note.notebook_id);
    setTitle(note.title);
    titleRef.current = note.title;
    contentRef.current = sanitizeHtml(note.body_html);
    contentAppliedRef.current = null;
    setReady(false);
    readyRef.current = false;
    reset(note.version);

    const storage = safeStorage();
    const draft = storage ? readDraft(storage, userId, note.id) : null;
    if (
      draft &&
      (draft.title !== note.title ||
        draft.bodyHtml !== contentRef.current)
    ) {
      setRecovery(draft);
    } else {
      setRecovery(null);
    }
  }, [initialNotebookId, isNew, note, reset, userId]);

  useEffect(() => {
    if (!editor) return;
    const key = isNew ? "new" : note?.id;
    if (!key || contentAppliedRef.current === key) return;
    editor.commands.setContent(contentRef.current, { emitUpdate: false });
    contentAppliedRef.current = key;
    setReady(true);
    readyRef.current = true;
  }, [editor, isNew, note?.id]);

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [canEdit, editor]);

  useEffect(() => {
    const id = note?.id;
    if (!id) {
      setNoteTags([]);
      return;
    }

    let active = true;
    listNoteTags(client, id)
      .then((rows) => {
        if (active) setNoteTags(rows);
      })
      .catch((nextError: unknown) => {
        if (active) toast.push(toMessage(nextError), "error");
      });

    return () => {
      active = false;
    };
  }, [client, note?.id, toast]);

  useEffect(() => {
    if (!note || note.owner_id === userId) {
      setSharePermission(null);
      return;
    }

    let active = true;
    getSharePermission(client, note.id, userId)
      .then((permission) => {
        if (active) setSharePermission(permission);
      })
      .catch((nextError: unknown) => {
        if (active) toast.push(toMessage(nextError), "error");
      });

    return () => {
      active = false;
    };
  }, [client, note?.id, note?.owner_id, toast, userId]);

  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current && state.status === "error") retry();
    wasOnline.current = online;
  }, [online, retry, state.status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flush]);

  function handleTitleChange(next: string) {
    setTitle(next);
    titleRef.current = next;
    if (!readyRef.current || !canEditRef.current) return;

    const body = editor?.getHTML() ?? "";
    if (!noteIdRef.current && !next.trim() && !htmlToPlainText(body)) {
      return;
    }
    change({ title: next, bodyHtml: body });
  }

  function applyContent(html: string) {
    const clean = sanitizeHtml(html);
    contentRef.current = clean;
    if (editor) {
      editor.commands.setContent(clean, { emitUpdate: false });
    }
  }

  function recoverDraft() {
    if (!recovery) return;
    setTitle(recovery.title);
    titleRef.current = recovery.title;
    applyContent(recovery.bodyHtml);
    setRecovery(null);
    recover({ title: recovery.title, bodyHtml: sanitizeHtml(recovery.bodyHtml) });
    toast.push("Draft recovered.", "success");
  }

  function discardDraft() {
    const storage = safeStorage();
    if (storage) {
      clearDraft(storage, userId, noteIdRef.current ?? "new");
    }
    setRecovery(null);
  }

  async function togglePin() {
    if (!note || !canManage) return;
    setBusy(true);
    try {
      const updated = await setNotePinned(client, note.id, !note.pinned);
      setNote(updated);
      onChanged();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!note || !canManage) return;
    setBusy(true);
    try {
      const updated = await setNoteArchived(client, note.id, !note.archived);
      setNote(updated);
      onChanged();
      toast.push(updated.archived ? "Note archived." : "Note restored from archive.", "success");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function changeNotebook(nextId: string | null) {
    setNotebookId(nextId);
    notebookIdRef.current = nextId;
    if (!note || !canManage) return;

    try {
      const updated = await moveNoteToNotebook(client, note.id, nextId);
      setNote(updated);
      onChanged();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    }
  }

  async function toggleTag(tag: TagSummary) {
    if (!note || !canManage) return;
    const attached = noteTags.some((item) => item.id === tag.id);

    try {
      if (attached) {
        await detachTag(client, note.id, tag.id);
        setNoteTags((current) =>
          current.filter((item) => item.id !== tag.id)
        );
      } else {
        await attachTag(client, note.id, tag.id);
        setNoteTags((current) => [...current, tag]);
      }
      await refreshTags();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    }
  }

  async function moveToTrash() {
    if (!note || !canManage) return;
    if (!window.confirm("Move this note to the trash?")) return;

    setBusy(true);
    try {
      await trashNote(client, note.id);
      onChanged();
      toast.push("Note moved to trash.", "success");
      onBack();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromTrash() {
    if (!note || !canManage) return;
    setBusy(true);
    try {
      await restoreNote(client, note.id);
      onChanged();
      toast.push("Note restored.", "success");
      onBack();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function permanentlyDelete() {
    if (!note || !canManage) return;
    if (
      !window.confirm(
        "Permanently delete this note? The database record cannot be recovered."
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      await deleteNotePermanently(client, note.id);
      onChanged();
      toast.push("Note deleted permanently.", "success");
      onBack();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function keepMine() {
    const currentId = noteIdRef.current;
    if (!currentId) return;

    setBusy(true);
    try {
      const latest = await getNote(client, currentId);
      if (!latest) throw new Error("This note no longer exists.");
      versionRef.current = latest.version;
      setNote(latest);
      reset(latest.version);
      change({
        title: titleRef.current,
        bodyHtml: editor?.getHTML() ?? "",
      });
      await flush();
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  async function reloadTheirs() {
    const currentId = noteIdRef.current;
    if (!currentId) return;

    setBusy(true);
    try {
      const latest = await getNote(client, currentId);
      if (!latest) throw new Error("This note no longer exists.");
      versionRef.current = latest.version;
      notebookIdRef.current = latest.notebook_id;
      setNotebookId(latest.notebook_id);
      setTitle(latest.title);
      titleRef.current = latest.title;
      applyContent(latest.body_html);
      setNote(latest);
      reset(latest.version);
      const storage = safeStorage();
      if (storage) clearDraft(storage, userId, latest.id);
      toast.push("Loaded the latest version.", "info");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setBusy(false);
    }
  }

  const notebookOptions = useMemo(
    () => flattenNotebookTree(buildNotebookTree(notebooks)),
    [notebooks]
  );

  const statusText =
    state.status === "saving"
      ? "Saving…"
      : state.status === "saved"
        ? "Saved"
        : state.status === "dirty"
          ? "Unsaved changes"
          : state.status === "error"
            ? "Save failed"
            : state.status === "conflict"
              ? "Conflict"
              : note && canEdit
                ? "Saved"
                : "";

  const readOnlyReason = isTrashed
    ? "This note is in the trash."
    : note && !isOwner && sharePermission !== "edit"
      ? "Shared with you as read-only."
      : "";

  if (noteId && loading) {
    return (
      <section className="editor-pane editor-loading" aria-label="Loading note">
        <span className="skeleton-line wide" />
        <span className="skeleton-line" />
        <span className="skeleton-line short" />
      </section>
    );
  }

  if (noteId && error) {
    return (
      <section className="editor-pane editor-state">
        <p role="alert">{toMessage(error)}</p>
        <button type="button" className="button small" onClick={reload}>
          Try again
        </button>
      </section>
    );
  }

  if (noteId && !loading && !note) {
    return (
      <section className="editor-pane editor-state">
        <h2>Note not found</h2>
        <p className="muted">It may have been deleted or you no longer have access.</p>
        <button type="button" className="button small" onClick={onBack}>
          Back to notes
        </button>
      </section>
    );
  }

  if (!ready) {
    return (
      <section className="editor-pane editor-loading" aria-label="Loading note">
        <span className="skeleton-line wide" />
        <span className="skeleton-line" />
        <span className="skeleton-line short" />
      </section>
    );
  }

  return (
    <section className="editor-pane" aria-label="Note editor">
      <header className="editor-header">
        <button
          type="button"
          className="icon-button editor-back"
          aria-label="Back to notes"
          onClick={onBack}
        >
          ←
        </button>

        <input
          className="title-input"
          value={title}
          placeholder="Untitled note"
          aria-label="Note title"
          readOnly={!canEdit}
          onChange={(event) => handleTitleChange(event.target.value)}
        />

        <div className="editor-actions">
          <span
            className={`save-state ${state.status}`}
            role="status"
            aria-live="polite"
          >
            {statusText}
          </span>

          {note && !isTrashed ? (
            <>
              <button
                type="button"
                className={`button small ghost${note.pinned ? " active" : ""}`}
                onClick={togglePin}
                disabled={busy || !canManage}
                aria-pressed={note.pinned}
              >
                {note.pinned ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
                className="button small ghost"
                onClick={toggleArchive}
                disabled={busy || !canManage}
              >
                {note.archived ? "Unarchive" : "Archive"}
              </button>
              <button
                type="button"
                className="button small ghost danger-text"
                onClick={moveToTrash}
                disabled={busy || !canManage}
              >
                Trash
              </button>
            </>
          ) : null}

          {note && isTrashed && canManage ? (
            <>
              <button
                type="button"
                className="button small"
                onClick={restoreFromTrash}
                disabled={busy}
              >
                Restore
              </button>
              <button
                type="button"
                className="button small ghost danger-text"
                onClick={permanentlyDelete}
                disabled={busy}
              >
                Delete forever
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="editor-meta-row">
        <label className="notebook-control">
          <span className="sr-only">Notebook</span>
          <select
            value={notebookId ?? ""}
            disabled={!canManage || isTrashed}
            onChange={(event) =>
              void changeNotebook(event.target.value || null)
            }
          >
            <option value="">Unfiled</option>
            {notebookOptions.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {"— ".repeat(depth)}
                {node.name}
              </option>
            ))}
          </select>
        </label>

        <details className="tag-picker">
          <summary>
            {noteTags.length > 0 ? (
              noteTags.map((tag) => (
                <span key={tag.id} className="tag-chip">
                  {tag.name}
                </span>
              ))
            ) : (
              <span className="muted">Add tags</span>
            )}
          </summary>
          <div className="tag-picker-menu">
            {allTags.length === 0 ? (
              <p className="muted">No tags yet. Create one in Manage tags.</p>
            ) : (
              allTags.map((tag) => (
                <label key={tag.id} className="tag-option">
                  <input
                    type="checkbox"
                    checked={noteTags.some((item) => item.id === tag.id)}
                    disabled={!note || !canManage || isTrashed}
                    onChange={() => void toggleTag(tag)}
                  />
                  <span>{tag.name}</span>
                  <span className="tag-count">{tag.note_count}</span>
                </label>
              ))
            )}
          </div>
        </details>

        {note ? (
          <span className="editor-meta">
            Edited {formatRelativeTime(note.updated_at)} · Created{" "}
            {formatDate(note.created_at)}
          </span>
        ) : (
          <span className="editor-meta">New note</span>
        )}
      </div>

      {!online ? (
        <div className="banner warning" role="status">
          You are offline. Changes stay in this browser until the connection returns.
        </div>
      ) : null}

      {recovery ? (
        <div className="banner" role="status">
          <span>
            An unsaved draft from {formatRelativeTime(recovery.savedAt)} is available.
          </span>
          <button type="button" className="link-button" onClick={recoverDraft}>
            Recover draft
          </button>
          <button type="button" className="link-button muted" onClick={discardDraft}>
            Discard
          </button>
        </div>
      ) : null}

      {state.status === "conflict" ? (
        <div className="banner conflict" role="alert">
          <span>This note changed elsewhere. Your draft is safe.</span>
          <button type="button" className="link-button" onClick={() => void reloadTheirs()}>
            Reload theirs
          </button>
          <button type="button" className="link-button" onClick={() => void keepMine()}>
            Keep mine
          </button>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="banner error" role="alert">
          <span>Save failed. Your content is kept in this browser.</span>
          <button type="button" className="link-button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : null}

      {readOnlyReason ? (
        <div className="banner muted" role="status">
          {readOnlyReason}
        </div>
      ) : null}

      {canEdit ? <EditorToolbar editor={editor} disabled={busy} /> : null}

      <div className={`editor-body${canEdit ? "" : " readonly"}`}>
        <EditorContent editor={editor} />
      </div>
    </section>
  );
}
