import type { Ref } from "react";
import type { AutosaveStatus } from "../lib/autosave";
import type { Note } from "../db/notes";
import type { NoteMode } from "../hooks/useNoteMode";
import SaveIndicator from "./SaveIndicator";

export interface NoteHeaderProps {
  title: string;
  mode: NoteMode;
  canEdit: boolean;
  status: AutosaveStatus;
  hasNote: boolean;
  busy: boolean;
  /** A Done press is waiting for the pending save to finish. */
  finishing: boolean;
  note: Note | null;
  isOwner: boolean;
  isTrashed: boolean;
  canManage: boolean;
  shareCount: number;
  titleRef?: Ref<HTMLInputElement>;
  onBack: () => void;
  onTitleChange: (title: string) => void;
  onToggleMode: () => void;
  onShare: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
}

/**
 * Title row and the actions that belong to the note. Kept presentational so
 * the editor only owns note state and the header only owns the layout; the
 * view/edit control lives here because it is the note's primary action.
 */
export default function NoteHeader({
  title,
  mode,
  canEdit,
  status,
  hasNote,
  busy,
  finishing,
  note,
  isOwner,
  isTrashed,
  canManage,
  shareCount,
  titleRef,
  onBack,
  onTitleChange,
  onToggleMode,
  onShare,
  onTogglePin,
  onToggleArchive,
  onTrash,
  onRestore,
  onDeleteForever,
}: NoteHeaderProps) {
  return (
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
        ref={titleRef}
        className="title-input"
        value={title}
        placeholder="Untitled note"
        aria-label="Note title"
        readOnly={!canEdit || mode === "view"}
        onChange={(event) => onTitleChange(event.target.value)}
      />

      <div className="editor-actions">
        <SaveIndicator status={status} hasNote={hasNote} />

        {canEdit && !isTrashed ? (
          <button
            type="button"
            className={`button small mode-toggle${mode === "edit" ? " active" : ""}`}
            onClick={onToggleMode}
            disabled={busy || finishing}
          >
            {mode === "edit" ? "Done" : "Edit"}
          </button>
        ) : null}

        {note && !isTrashed ? (
          <>
            {isOwner ? (
              <button
                type="button"
                className="button small ghost"
                onClick={onShare}
                disabled={busy}
              >
                Share{shareCount > 0 ? ` · ${shareCount}` : ""}
              </button>
            ) : null}
            <button
              type="button"
              className={`button small ghost${note.pinned ? " active" : ""}`}
              onClick={onTogglePin}
              disabled={busy || !canManage}
              aria-pressed={note.pinned}
            >
              {note.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              className="button small ghost"
              onClick={onToggleArchive}
              disabled={busy || !canManage}
            >
              {note.archived ? "Unarchive" : "Archive"}
            </button>
            <button
              type="button"
              className="button small ghost danger-text"
              onClick={onTrash}
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
              onClick={onRestore}
              disabled={busy}
            >
              Restore
            </button>
            <button
              type="button"
              className="button small ghost danger-text"
              onClick={onDeleteForever}
              disabled={busy}
            >
              Delete forever
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
