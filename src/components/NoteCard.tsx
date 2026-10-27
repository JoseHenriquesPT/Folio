import { Link } from "react-router-dom";
import type { NoteSummary } from "../db/notes";
import { formatRelativeTime, noteTitle, snippet } from "../lib/format";
import { useWorkspace } from "./WorkspaceProvider";

export default function NoteCard({
  note,
  mode,
  hrefSearch,
}: {
  note: NoteSummary;
  mode: "cards" | "list";
  hrefSearch: string;
}) {
  const { notebooks } = useWorkspace();
  const notebook = note.notebook_id
    ? notebooks.find((item) => item.id === note.notebook_id)
    : null;
  const visibleTags = note.tags.slice(0, 3);
  const hiddenTags = note.tags.length - visibleTags.length;

  return (
    <Link
      to={`/note/${note.id}${hrefSearch ? `?${hrefSearch}` : ""}`}
      className={`note-card ${mode}`}
      aria-label={noteTitle(note.title)}
    >
      <div className="note-card-top">
        <h3>{noteTitle(note.title)}</h3>
        {note.pinned ? (
          <span className="badge pin" title="Pinned">
            Pin
          </span>
        ) : null}
      </div>

      <p className="note-snippet">{snippet(note.body_text)}</p>

      <div className="note-card-meta">
        <span className="note-time">{formatRelativeTime(note.updated_at)}</span>
        {mode === "list" && notebook ? (
          <span className="note-notebook">{notebook.name}</span>
        ) : null}
      </div>

      {visibleTags.length > 0 || note.share_count > 0 || note.attachment_count > 0 ? (
        <div className="note-card-foot">
          <span className="note-tags">
            {visibleTags.map((tag) => (
              <span key={tag.id} className="tag-chip">
                {tag.name}
              </span>
            ))}
            {hiddenTags > 0 ? (
              <span className="tag-chip muted">+{hiddenTags}</span>
            ) : null}
          </span>
          <span className="note-badges">
            {note.share_count > 0 ? <span className="badge">Shared</span> : null}
            {note.attachment_count > 0 ? (
              <span className="badge">
                {note.attachment_count} file{note.attachment_count === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </Link>
  );
}
