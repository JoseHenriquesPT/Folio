import { useCallback, useEffect, useRef, useState } from "react";
import { useSupabase } from "../db/SupabaseProvider";
import {
  listNotes,
  type Note as FullNote,
  type NoteSort,
  type NoteSummary,
  type NoteView,
} from "../db/notes";

export interface NoteListFilters {
  view: NoteView;
  notebookId?: string | null;
  tagId?: string;
  search?: string;
  sort?: NoteSort;
  direction?: "asc" | "desc";
  sharedWithUserId?: string;
  refreshKey?: number;
}

export function useNoteList(filters: NoteListFilters) {
  const client = useSupabase();
  const {
    view,
    notebookId,
    tagId,
    search,
    sort = "updated",
    direction,
    sharedWithUserId,
    refreshKey = 0,
  } = filters;

  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      const requestId = ++requestRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }

      try {
        const result = await listNotes(client, {
          view,
          notebookId,
          tagId,
          search,
          sort,
          direction,
          sharedWithUserId,
          page: nextPage,
        });

        if (requestId !== requestRef.current) return;
        setNotes((current) =>
          append ? [...current, ...result.notes] : result.notes
        );
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (nextError) {
        if (requestId === requestRef.current) setError(nextError);
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [client, view, notebookId, tagId, search, sort, direction, sharedWithUserId]
  );

  useEffect(() => {
    void load(0, false);
  }, [load, reloadToken, refreshKey]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void load(page + 1, true);
  }, [hasMore, load, loading, loadingMore, page]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  /**
   * A save already returned the fresh note row: fold it into the list in
   * memory instead of paying for another query on every save. Ordering catches
   * up when the list next refreshes.
   */
  const applySaved = useCallback((note: FullNote) => {
    setNotes((current) => {
      let changed = false;
      const next = current.map((row) => {
        if (row.id !== note.id) return row;
        changed = true;
        return { ...row, ...note };
      });
      return changed ? next : current;
    });
  }, []);

  return {
    notes,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    applySaved,
  };
}
