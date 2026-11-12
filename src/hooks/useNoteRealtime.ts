import { useEffect, useRef } from "react";
import type {
  NoteRow,
  NoteShareRow,
  NotebookShareRow,
} from "../db/database.types";
import { useSupabase } from "../db/SupabaseProvider";
import type { RealtimeEventType } from "../lib/realtime";

export interface PostgresChange<T> {
  eventType: RealtimeEventType;
  new: Partial<T>;
  old: Partial<T>;
}

export interface NoteRealtimeHandlers {
  onNoteChange: (change: PostgresChange<NoteRow>) => void;
  onShareChange: (change: PostgresChange<NoteShareRow>) => void;
  onNotebookShareChange: (change: PostgresChange<NotebookShareRow>) => void;
}

export function useNoteRealtime(
  noteId: string | null,
  handlers: NoteRealtimeHandlers
) {
  const client = useSupabase();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!noteId) return;

    const channel = client
      .channel(`note-${noteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `id=eq.${noteId}`,
        },
        (payload) =>
          handlersRef.current.onNoteChange(
            payload as unknown as PostgresChange<NoteRow>
          )
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "note_shares",
          filter: `note_id=eq.${noteId}`,
        },
        (payload) =>
          handlersRef.current.onShareChange(
            payload as unknown as PostgresChange<NoteShareRow>
          )
      )
      // Notebook shares cannot be filtered down to one note: any visible
      // change may alter this note's inherited permission, so the handler
      // re-reads it.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notebook_shares" },
        (payload) =>
          handlersRef.current.onNotebookShareChange(
            payload as unknown as PostgresChange<NotebookShareRow>
          )
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, noteId]);
}
