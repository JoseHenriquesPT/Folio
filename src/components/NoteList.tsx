import { useEffect, useRef } from "react";
import type { NoteSummary } from "../db/notes";
import { toMessage } from "../lib/errors";
import NoteCard, {
  type NoteActionsHandler,
  type NoteDropHandler,
} from "./NoteCard";

interface NoteListProps {
  notes: NoteSummary[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: unknown;
  mode: "cards" | "list";
  searchActive: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  emptyTitle: string;
  emptyBody: string;
  onNewNote: () => void;
  allowNew: boolean;
  hrefSearch: string;
  onActions: NoteActionsHandler;
  onDrop: NoteDropHandler;
}

export default function NoteList({
  notes,
  loading,
  loadingMore,
  hasMore,
  error,
  mode,
  searchActive,
  onLoadMore,
  onRetry,
  emptyTitle,
  emptyBody,
  onNewNote,
  allowNew,
  hrefSearch,
  onActions,
  onDrop,
}: NoteListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "320px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);

  if (error) {
    return (
      <div className="list-state">
        <p role="alert">{toMessage(error)}</p>
        <button type="button" className="button small" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  if (loading && notes.length === 0) {
    return (
      <div className={`note-list ${mode}`} aria-label="Loading notes">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={`note-card skeleton ${mode}`}>
            <span className="skeleton-line wide" />
            <span className="skeleton-line" />
            <span className="skeleton-line short" />
          </div>
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="list-state empty">
        <h2>{searchActive ? "No matches" : emptyTitle}</h2>
        <p>{searchActive ? "Try another word or clear the search." : emptyBody}</p>
        {!searchActive && allowNew ? (
          <button type="button" className="button primary" onClick={onNewNote}>
            New note
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`note-list ${mode}`}>
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          mode={mode}
          hrefSearch={hrefSearch}
          onActions={onActions}
          onDrop={onDrop}
        />
      ))}

      <div ref={sentinelRef} className="list-sentinel" aria-hidden="true" />

      {loadingMore ? (
        <p className="list-loading" role="status">
          Loading more…
        </p>
      ) : null}

      {hasMore && !loadingMore ? (
        <button type="button" className="button ghost load-more" onClick={onLoadMore}>
          Load more notes
        </button>
      ) : null}
    </div>
  );
}
