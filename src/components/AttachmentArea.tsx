import { useRef, useState, type DragEvent } from "react";
import { formatBytes, MAX_ATTACHMENT_BYTES } from "../lib/attachments";
import type { NoteAttachment } from "../hooks/useNoteAttachments";

interface AttachmentAreaProps {
  items: NoteAttachment[];
  loading: boolean;
  uploading: boolean;
  canEdit: boolean;
  isOwner: boolean;
  noteSaved: boolean;
  onUpload: (files: File[]) => void;
  onRemove: (attachment: NoteAttachment) => void;
  onDownload: (attachment: NoteAttachment) => void;
}

export default function AttachmentArea({
  items,
  loading,
  uploading,
  canEdit,
  isOwner,
  noteSaved,
  onUpload,
  onRemove,
  onDownload,
}: AttachmentAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const acceptFiles = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (list.length > 0) onUpload(list);
  };

  const accepts = canEdit && noteSaved;

  // Dropping is only wired while the note can take files; readers get nothing.
  const dragHandlers = accepts
    ? {
        onDragOver: (event: DragEvent<Element>) => {
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (event: DragEvent<Element>) => {
          event.preventDefault();
          setDragging(false);
          acceptFiles(event.dataTransfer.files);
        },
      }
    : {};

  if (!canEdit && items.length === 0) return null;

  return (
    <section className="attachment-area" aria-label="Attachments">
      <div className="attachment-head">
        <h2>
          Attachments
          {items.length > 0 ? <span className="attachment-count">{items.length}</span> : null}
        </h2>
        {canEdit && noteSaved ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              aria-label="Add files"
              onChange={(event) => {
                acceptFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="button small ghost"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Adding…" : "Add files"}
            </button>
          </>
        ) : null}
        {canEdit && !noteSaved ? (
          <span className="muted">Save the note once to add files.</span>
        ) : null}
      </div>

      {loading ? (
        <span className="skeleton-line" />
      ) : items.length === 0 ? (
        canEdit && noteSaved ? (
          <div
            className={`attachment-drop${dragging ? " dragging" : ""}`}
            {...dragHandlers}
          >
            Drop files here, or paste an image into the note.
          </div>
        ) : null
      ) : (
        <ul
          className={`attachment-list${dragging ? " dragging" : ""}`}
          {...dragHandlers}
        >
          {items.map((item) => (
            <li key={item.id} className="attachment-card">
              {item.isImage && item.url ? (
                <img
                  className="attachment-thumb"
                  src={item.url}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="attachment-icon" aria-hidden="true">
                  ▤
                </span>
              )}
              <span className="attachment-name" title={item.file_name}>
                {item.file_name}
              </span>
              <span className="attachment-size">{formatBytes(item.size_bytes)}</span>
              <button
                type="button"
                className="link-button"
                onClick={() => onDownload(item)}
              >
                Download
              </button>
              {isOwner && canEdit ? (
                <button
                  type="button"
                  className="link-button danger-text"
                  onClick={() => onRemove(item)}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <p className="attachment-hint">
          Up to {formatBytes(MAX_ATTACHMENT_BYTES)} per file.
        </p>
      ) : null}
    </section>
  );
}
