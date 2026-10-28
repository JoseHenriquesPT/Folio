import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useSession } from "../auth/session";
import type { NoteRow, NoteShareRow } from "../db/database.types";
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
import { getSharePermission, type SharePermission } from "../db/shares";
import { useNoteTags } from "../hooks/useNoteTags";
import { useAutosave } from "../hooks/useAutosave";
import { useNote } from "../hooks/useNote";
import {
  useNoteAttachments,
} from "../hooks/useNoteAttachments";
import { useAttachmentActions } from "../hooks/useAttachmentActions";
import {
  useNoteRealtime,
  type PostgresChange,
} from "../hooks/useNoteRealtime";
import { useNoteSharing } from "../hooks/useNoteSharing";
import { useOnline } from "../hooks/useOnline";
import { ATTACHMENT_REF_PREFIX } from "../lib/attachments";
import {
  clearDraft,
  readDraft,
  writeDraft,
  type NoteDraft,
} from "../lib/drafts";
import { toMessage } from "../lib/errors";
import { formatRelativeTime } from "../lib/format";
import { editorExtensions } from "../lib/editor";
import { buildNotebookTree, flattenNotebookTree } from "../lib/notebooks";
import { decideNoteChange, decideShareChange } from "../lib/realtime";
import { htmlToPlainText, sanitizeHtml } from "../lib/sanitize";
import AttachmentArea from "./AttachmentArea";
import EditorToolbar from "./EditorToolbar";
import NoteMetaRow from "./NoteMetaRow";
import ShareDialog from "./ShareDialog";
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
  const [notebookId, setNotebookId] = useState<string | null>(
    initialNotebookId
  );
  const [sharePermission, setSharePermission] =
    useState<SharePermission | null>(null);
  const [remoteChange, setRemoteChange] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [recovery, setRecovery] = useState<NoteDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(isNew);

  const {
    shareCount,
    ownerName,
    shareOpen,
    shareVersion,
    openShare,
    closeShare,
    notifySharesChanged,
  } = useNoteSharing(client, note, userId, toast);

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

  const attachments = useNoteAttachments({
    client,
    noteId: note?.id ?? null,
    canEdit: canEdit && !isTrashed,
    isOwner,
    toast,
  });
  const { resolveHtml, restoreHtml } = attachments;

  const { noteTags, toggle: toggleTag } = useNoteTags({
    client,
    noteId: note?.id ?? null,
    canManage,
    toast,
    onTagsChanged: refreshTags,
  });

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

  const saveStatusRef = useRef(state.status);
  saveStatusRef.current = state.status;

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
      const snapshot = {
        title: titleRef.current,
        bodyHtml: restoreHtml(bodyHtml),
      };
      if (
        !noteIdRef.current &&
        !snapshot.title.trim() &&
        !htmlToPlainText(snapshot.bodyHtml)
      ) {
        return;
      }
      change(snapshot);
    },
    [change, restoreHtml]
  );
  scheduleRef.current = scheduleSnapshot;

  const {
    addFiles,
    remove: removeAttachment,
    download: downloadAttachment,
    dropTarget,
  } = useAttachmentActions({
    client,
    editor,
    attachments,
    canEdit: canEdit && !isTrashed,
    noteSaved: Boolean(note),
    toast,
    onBodyChange: (bodyHtml) => {
      applyContent(bodyHtml);
      if (readyRef.current && canEditRef.current) {
        change({ title: titleRef.current, bodyHtml });
      }
    },
  });

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
      setSharePermission(null);
      closeShare();
      setRemoteChange(false);
      setAccessLost(false);
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
    closeShare();
    setRemoteChange(false);
    setAccessLost(false);
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
    // Images point at private objects; wait for signed URLs so the browser
    // never tries to fetch an `attachment:` reference.
    if (
      contentRef.current.includes(ATTACHMENT_REF_PREFIX) &&
      attachments.loadedNoteId !== note?.id
    ) {
      return;
    }
    editor.commands.setContent(resolveHtml(contentRef.current), {
      emitUpdate: false,
    });
    contentAppliedRef.current = key;
    setReady(true);
    readyRef.current = true;
  }, [editor, isNew, note?.id, resolveHtml, attachments.loadedNoteId]);

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [canEdit, editor]);

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

  useNoteRealtime(noteId, {
    onNoteChange: handleNoteChange,
    onShareChange: handleShareChange,
  });

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

    const body = restoreHtml(editor?.getHTML() ?? "");
    if (!noteIdRef.current && !next.trim() && !htmlToPlainText(body)) {
      return;
    }
    change({ title: next, bodyHtml: body });
  }

  function applyContent(html: string) {
    const clean = sanitizeHtml(html);
    contentRef.current = clean;
    if (editor) {
      editor.commands.setContent(resolveHtml(clean), { emitUpdate: false });
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
      const cleanup = await attachments.removeAll();
      if (!cleanup.ok) {
        toast.push(
          "Could not remove this note's files. Nothing was deleted — try again.",
          "error"
        );
        return;
      }

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

  async function refreshFromServer(announce: boolean) {
    const currentId = noteIdRef.current;
    if (!currentId) return;

    try {
      const latest = await getNote(client, currentId);
      if (!latest) {
        setAccessLost(true);
        return;
      }

      versionRef.current = latest.version;
      notebookIdRef.current = latest.notebook_id;
      setNotebookId(latest.notebook_id);
      setTitle(latest.title);
      titleRef.current = latest.title;
      applyContent(latest.body_html);
      setNote(latest);
      reset(latest.version);
      setRemoteChange(false);
      if (announce) {
        toast.push("Updated with changes from elsewhere.", "info");
      }
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    }
  }

  function handleNoteChange(change: PostgresChange<NoteRow>) {
    const currentId = noteIdRef.current;
    if (!currentId) return;

    const row = change.eventType === "DELETE" ? change.old : change.new;
    const status = saveStatusRef.current;
    const decision = decideNoteChange({
      eventType: change.eventType,
      noteId: row.id ?? currentId,
      currentNoteId: currentId,
      currentVersion: versionRef.current,
      incomingVersion: row.version,
      dirty: status === "dirty" || status === "conflict",
      saving: status === "saving",
      selfUserId: userId,
      lastEditedBy: row.last_edited_by,
    });

    if (decision === "ignore") return;
    if (decision === "removed") {
      setAccessLost(true);
      return;
    }
    if (decision === "warn") {
      setRemoteChange(true);
      return;
    }
    void refreshFromServer(true);
  }

  function handleShareChange(change: PostgresChange<NoteShareRow>) {
    const currentId = noteIdRef.current;
    if (!currentId) return;

    const row = change.eventType === "DELETE" ? change.old : change.new;
    const decision = decideShareChange({
      eventType: change.eventType,
      noteId: row.note_id ?? currentId,
      currentNoteId: currentId,
      sharedWith: row.shared_with ?? "",
      userId,
      isOwner: note?.owner_id === userId,
    });

    if (decision === "ignore") return;
    if (decision === "check-access") {
      void getSharePermission(client, currentId, userId)
        .then((next) => {
          if (next) {
            setSharePermission(next);
            return;
          }
          setAccessLost(true);
          toast.push("Access to this note was removed.", "info");
          onChanged();
        })
        .catch((nextError: unknown) => {
          toast.push(toMessage(nextError), "error");
        });
      return;
    }
    if (decision === "permission") {
      void getSharePermission(client, currentId, userId)
        .then((next) => {
          setSharePermission(next);
          if (next === "read") {
            toast.push("Your access is now read-only.", "info");
          } else if (next === "edit") {
            toast.push("You can now edit this note.", "info");
          }
        })
        .catch((nextError: unknown) => {
          toast.push(toMessage(nextError), "error");
        });
      return;
    }

    notifySharesChanged();
  }

  function handleSharesChanged() {
    onChanged();
    notifySharesChanged();
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
      setRemoteChange(false);
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
      await refreshFromServer(false);
      const storage = safeStorage();
      if (storage) clearDraft(storage, userId, currentId);
      toast.push("Loaded the latest version.", "info");
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
      ? `Shared with you by ${ownerName ?? "the owner"} as read-only.`
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

  if (accessLost) {
    return (
      <section className="editor-pane editor-state">
        <h2>Access removed</h2>
        <p className="muted">
          This note was unshared or deleted, so it is no longer available to
          you.
        </p>
        <button type="button" className="button small" onClick={onBack}>
          Back to notes
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
              {isOwner ? (
                <button
                  type="button"
                  className="button small ghost"
                  onClick={openShare}
                  disabled={busy}
                >
                  Share{shareCount > 0 ? ` · ${shareCount}` : ""}
                </button>
              ) : null}
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

      <NoteMetaRow
        note={note}
        notebookId={notebookId}
        notebookOptions={notebookOptions}
        canManage={canManage}
        isTrashed={isTrashed}
        isOwner={isOwner}
        shareCount={shareCount}
        ownerName={ownerName}
        sharePermission={sharePermission}
        noteTags={noteTags}
        allTags={allTags}
        onChangeNotebook={(nextId) => void changeNotebook(nextId)}
        onToggleTag={(tag) => void toggleTag(tag)}
      />

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

      {state.status === "conflict" || remoteChange ? (
        <div className="banner conflict" role="alert">
          <span>
            {state.status === "conflict"
              ? "This note changed elsewhere. Your draft is safe."
              : "This note changed elsewhere while you were editing. Your changes are still here."}
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => void reloadTheirs()}
          >
            Reload theirs
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => void keepMine()}
          >
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

      <div
        className={`editor-body${canEdit ? "" : " readonly"}`}
        {...dropTarget}
      >
        <EditorContent editor={editor} />
      </div>

      <AttachmentArea
        items={attachments.items}
        loading={attachments.loading}
        uploading={attachments.uploading}
        canEdit={canEdit && !isTrashed}
        isOwner={isOwner}
        noteSaved={Boolean(note)}
        onUpload={(files) => void addFiles(files)}
        onRemove={(item) => void removeAttachment(item)}
        onDownload={(item) => void downloadAttachment(item)}
      />

      {note && isOwner && !isTrashed ? (
        <ShareDialog
          open={shareOpen}
          noteId={note.id}
          ownerId={note.owner_id}
          currentUserId={userId}
          version={shareVersion}
          onClose={closeShare}
          onChanged={handleSharesChanged}
        />
      ) : null}
    </section>
  );
}
