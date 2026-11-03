import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useSession } from "../auth/session";
import type { NoteRow, NoteShareRow } from "../db/database.types";
import { useSupabase } from "../db/SupabaseProvider";
import {
  createNote,
  getNote,
  saveNote,
} from "../db/notes";
import { getSharePermission, type SharePermission } from "../db/shares";
import { useNoteTags } from "../hooks/useNoteTags";
import { useAutosave } from "../hooks/useAutosave";
import { useNote } from "../hooks/useNote";
import { useNoteEditorActions } from "../hooks/useNoteEditorActions";
import { useNoteMode } from "../hooks/useNoteMode";
import {
  useNoteAttachments,
} from "../hooks/useNoteAttachments";
import { useAttachmentActions } from "../hooks/useAttachmentActions";
import {
  useNoteRealtime,
  type PostgresChange,
} from "../hooks/useNoteRealtime";
import { useNoteSharing } from "../hooks/useNoteSharing";
import { useKeyboardOpen } from "../hooks/useKeyboardOpen";
import { useOnline } from "../hooks/useOnline";
import { ATTACHMENT_REF_PREFIX } from "../lib/attachments";
import {
  clearDraft,
  readDraft,
  writeDraft,
  type NoteDraft,
} from "../lib/drafts";
import { toMessage } from "../lib/errors";
import { editorExtensions } from "../lib/editor";
import { imageFromClick, type ViewerImage } from "../lib/imageView";
import {
  linkTargetFrom,
  type AnchorRect,
  type LinkTarget,
} from "../lib/linkPopover";
import { buildNotebookTree, flattenNotebookTree } from "../lib/notebooks";
import { decideNoteChange, decideShareChange } from "../lib/realtime";
import { htmlToPlainText, sanitizeHtml } from "../lib/sanitize";
import { saveStatusView } from "../lib/saveStatus";
import AttachmentArea from "./AttachmentArea";
import ConflictReview, { type ConflictVersion } from "./ConflictReview";
import { useConfirm } from "./ConfirmProvider";
import EditorToolbar from "./EditorToolbar";
import ImageViewer from "./ImageViewer";
import LinkPopover from "./LinkPopover";
import NoteBanners from "./NoteBanners";
import NoteHeader from "./NoteHeader";
import NoteMetaRow from "./NoteMetaRow";
import ShareDialog from "./ShareDialog";
import { useToast } from "./ToastProvider";
import { useWorkspace } from "./WorkspaceProvider";

interface NoteEditorProps {
  noteId: string | null;
  initialNotebookId: string | null;
  onCreated: (noteId: string) => void;
  onChanged: () => void;
  onSavedNote: (note: NoteRow) => void;
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
  onSavedNote,
  onBack,
}: NoteEditorProps) {
  const session = useSession();
  const userId = session.user.id;
  const client = useSupabase();
  const toast = useToast();
  const confirm = useConfirm();
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
  const [resolving, setResolving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [ready, setReady] = useState(isNew);
  const [viewerImage, setViewerImage] = useState<ViewerImage | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<{
    target: LinkTarget;
    anchor: AnchorRect;
  } | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [serverVersion, setServerVersion] = useState<ConflictVersion | null>(
    null
  );
  const keyboardOpen = useKeyboardOpen();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleFocusedRef = useRef(false);
  const conflictRequestRef = useRef(0);

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
  const { mode, enterEdit, enterView, markCreated } = useNoteMode({
    noteId,
    canEdit,
  });

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
    busy,
    togglePin,
    toggleArchive,
    changeNotebook,
    moveToTrash,
    restoreFromTrash,
    permanentlyDelete,
  } = useNoteEditorActions({
    client,
    note,
    canManage,
    setNote,
    setNotebookId,
    notebookIdRef,
    removeAllAttachments: attachments.removeAll,
    confirm,
    toast,
    onChanged,
    onBack,
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
        markCreated(created.id);
        onCreated(created.id);
        // A new note changes the list, so pay for one refresh here; ordinary
        // saves fold their returned row into the list instead.
        onChanged();
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
      onSavedNote(saved);
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
    },
    onUnchanged: () => {
      // No request went out, so skip the list refetch too — but drop the draft
      // that onDirty wrote, because the content matches the server already.
      const storage = safeStorage();
      if (storage) {
        clearDraft(storage, userId, noteIdRef.current ?? "new");
      }
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
    confirm,
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
      setConflictOpen(false);
      setServerVersion(null);
      setLinkPrompt(null);
      titleFocusedRef.current = false;
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
    setConflictOpen(false);
    setServerVersion(null);
    setLinkPrompt(null);
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
    // A different note opens at its own top instead of wherever the previous
    // note left the scroll position.
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    setReady(true);
    readyRef.current = true;
    // Seed the no-op guard with the content the editor will hand back for an
    // untouched note, so a reverted keystroke costs no request. The title comes
    // from the server, not the ref: a title typed before the body arrived has
    // not been saved yet and must still reach the database.
    if (!isNew && note) {
      reset(note.version, {
        title: note.title,
        bodyHtml: restoreHtml(editor.getHTML()),
      });
    }
  }, [
    editor,
    isNew,
    note,
    reset,
    restoreHtml,
    resolveHtml,
    attachments.loadedNoteId,
  ]);

  useEffect(() => {
    editor?.setEditable(canEdit && mode === "edit");
  }, [canEdit, editor, mode]);

  // A new note opens for writing, so the title is the first thing the reader
  // can type into. Later mode swaps keep focus where the reader put it.
  useEffect(() => {
    if (!isNew || !ready || mode !== "edit" || titleFocusedRef.current) return;
    titleFocusedRef.current = true;
    const frame = window.setTimeout(() => titleInputRef.current?.focus(), 0);
    return () => window.clearTimeout(frame);
  }, [isNew, mode, ready]);

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

  /**
   * Reading mode follows a link straight out. Editing mode keeps the caret in
   * the note and offers a small "Open link" card next to the tapped link, which
   * works the same with a finger as with a mouse.
   */
  function handleBodyClick(event: ReactMouseEvent<HTMLDivElement>) {
    const image = imageFromClick(event.target);
    if (image) {
      setViewerImage(image);
      return;
    }

    if (!(event.target instanceof Element)) return;
    if (!event.target.closest(".tiptap")) return;
    const target = linkTargetFrom(event.target);
    if (!target) return;

    event.preventDefault();
    if (mode === "view") {
      window.open(target.href, "_blank", "noopener,noreferrer");
      return;
    }

    const anchor = event.target.closest("a[href]");
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setLinkPrompt({
      target,
      anchor: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    });
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
      // Re-seed the no-op guard with what now sits on the server, so an
      // untouched note after a refresh costs no requests either.
      reset(latest.version, {
        title: latest.title,
        bodyHtml: restoreHtml(editor?.getHTML() ?? latest.body_html),
      });
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

    setResolving(true);
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
      setConflictOpen(false);
      setServerVersion(null);
      toast.push("Kept your version.", "success");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setResolving(false);
    }
  }

  function closeConflictReview() {
    conflictRequestRef.current += 1;
    setConflictOpen(false);
    setConflictLoading(false);
    setConflictError(null);
    setServerVersion(null);
  }

  async function loadServerVersion() {
    const currentId = noteIdRef.current;
    if (!currentId) return;

    const requestId = ++conflictRequestRef.current;
    setConflictLoading(true);
    setConflictError(null);
    setServerVersion(null);

    try {
      const latest = await getNote(client, currentId);
      if (requestId !== conflictRequestRef.current) return;
      if (!latest) {
        setAccessLost(true);
        closeConflictReview();
        return;
      }
      setServerVersion({
        title: latest.title,
        bodyHtml: latest.body_html,
      });
    } catch (nextError) {
      if (requestId === conflictRequestRef.current) {
        setConflictError(toMessage(nextError));
      }
    } finally {
      if (requestId === conflictRequestRef.current) setConflictLoading(false);
    }
  }

  async function openConflictReview() {
    if (conflictOpen) {
      closeConflictReview();
      return;
    }

    setConflictOpen(true);
    await loadServerVersion();
  }

  async function applyServerVersion() {
    const currentId = noteIdRef.current;
    if (!currentId || !serverVersion) return;

    const accepted = await confirm({
      title: "Use server version",
      message:
        "Replace your local version with the copy on the server? Your local draft will be discarded.",
      confirmLabel: "Use server version",
      tone: "danger",
    });
    if (!accepted) return;

    setResolving(true);
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
      reset(latest.version, {
        title: latest.title,
        bodyHtml: restoreHtml(editor?.getHTML() ?? latest.body_html),
      });
      const storage = safeStorage();
      if (storage) clearDraft(storage, userId, currentId);
      setRemoteChange(false);
      onSavedNote(latest);
      closeConflictReview();
      toast.push("Loaded the latest version.", "info");
    } catch (nextError) {
      toast.push(toMessage(nextError), "error");
    } finally {
      setResolving(false);
    }
  }

  async function toggleMode() {
    if (mode === "view") {
      enterEdit();
      window.setTimeout(() => editor?.commands.focus(), 0);
      return;
    }

    setFinishing(true);
    try {
      await flush();
      // A blank new note has nothing to show in view mode; stay in the editor
      // rather than swapping to an empty reading page that was never saved.
      if (!isNew || noteIdRef.current) enterView();
    } finally {
      setFinishing(false);
    }
  }

  async function leaveEditor() {
    setFinishing(true);
    try {
      await flush();
      onChanged();
      onBack();
    } finally {
      setFinishing(false);
    }
  }

  const notebookOptions = useMemo(
    () => flattenNotebookTree(buildNotebookTree(notebooks)),
    [notebooks]
  );

  const saveStatus = saveStatusView({
    status: state.status,
    hasNote: Boolean(note),
  });
  const actionBusy = busy || resolving;
  const hasNote = Boolean(note);
  const localConflictVersion: ConflictVersion = {
    title,
    bodyHtml: editor?.getHTML() ?? contentRef.current,
  };

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
    <section
      className={`editor-pane${keyboardOpen ? " keyboard-open" : ""}`}
      aria-label="Note editor"
    >
      {/* The chip below lives in the title rows, which scroll away with the
          note, so the save status is announced from a region that never
          leaves the page. */}
      <span className="sr-only" role="status" aria-live="polite">
        {saveStatus.label}
      </span>

      {/* Notices sit above the scroller: offline, draft and conflict banners
          have to stay readable wherever the reader has scrolled to. */}
      <NoteBanners
        online={online}
        recovery={recovery}
        status={state.status}
        remoteChange={remoteChange}
        conflictOpen={conflictOpen}
        readOnlyReason={readOnlyReason}
        onRecoverDraft={recoverDraft}
        onDiscardDraft={discardDraft}
        onReviewConflict={() => void openConflictReview()}
        onRetry={retry}
      />

      <ConflictReview
        open={conflictOpen}
        loading={conflictLoading}
        error={conflictError}
        busy={actionBusy}
        local={localConflictVersion}
        server={serverVersion}
        onClose={closeConflictReview}
        onRetry={() => void loadServerVersion()}
        onKeepMine={() => void keepMine()}
        onUseServer={() => void applyServerVersion()}
      />

      <div
        ref={bodyRef}
        className={`editor-body${mode === "view" || !canEdit ? " readonly" : ""}`}
        {...dropTarget}
        onClick={handleBodyClick}
      >
        {/* The title rows belong to the note itself: scrolling down carries
            them off the top of the screen, and they are back the moment the
            reader reaches the top of the note. */}
        <NoteHeader
          title={title}
          mode={mode}
          canEdit={canEdit}
          status={state.status}
          hasNote={hasNote}
          busy={actionBusy}
          finishing={finishing}
          note={note}
          isOwner={isOwner}
          isTrashed={isTrashed}
          canManage={canManage}
          shareCount={shareCount}
          titleRef={titleInputRef}
          onBack={() => void leaveEditor()}
          onTitleChange={handleTitleChange}
          onToggleMode={() => void toggleMode()}
          onShare={openShare}
          onTogglePin={togglePin}
          onToggleArchive={toggleArchive}
          onTrash={moveToTrash}
          onRestore={restoreFromTrash}
          onDeleteForever={permanentlyDelete}
        />

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

        {/* Sticky inside the scroller: it slides up into the space the title
            rows leave behind and is the one bar that never goes away. View
            mode hides it entirely; the note becomes a reading page. */}
        {mode === "edit" && canEdit ? (
          <EditorToolbar editor={editor} disabled={actionBusy} />
        ) : null}

        <div className="editor-content">
          <EditorContent editor={editor} />
        </div>
      </div>

      <AttachmentArea
        items={attachments.items}
        loading={attachments.loading}
        uploading={attachments.uploading}
        canEdit={canEdit && !isTrashed && mode === "edit"}
        isOwner={isOwner}
        noteSaved={Boolean(note)}
        onUpload={(files) => void addFiles(files)}
        onRemove={(item) => void removeAttachment(item)}
        onDownload={(item) => void downloadAttachment(item)}
      />

      {linkPrompt ? (
        <LinkPopover
          target={linkPrompt.target}
          anchor={linkPrompt.anchor}
          onClose={() => setLinkPrompt(null)}
        />
      ) : null}

      {viewerImage ? (
        <ImageViewer
          image={viewerImage}
          onClose={() => setViewerImage(null)}
        />
      ) : null}

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
