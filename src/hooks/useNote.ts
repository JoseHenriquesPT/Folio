import { useCallback, useEffect, useRef, useState } from "react";
import { useSupabase } from "../db/SupabaseProvider";
import { getNote, type Note } from "../db/notes";

export function useNote(noteId: string | null) {
  const client = useSupabase();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(Boolean(noteId));
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!noteId) {
      setNote(null);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    getNote(client, noteId)
      .then((row) => {
        if (requestId === requestRef.current) setNote(row);
      })
      .catch((nextError: unknown) => {
        if (requestId === requestRef.current) setError(nextError);
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [client, noteId, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return { note, setNote, loading, error, reload };
}
