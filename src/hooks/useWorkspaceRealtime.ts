import { useEffect, useRef } from "react";
import type { NoteRow } from "../db/database.types";
import { useSupabase } from "../db/SupabaseProvider";
import { shouldRefreshList } from "../lib/realtime";
import type { PostgresChange } from "./useNoteRealtime";

export function useWorkspaceRealtime(
  userId: string,
  onChange: () => void,
  enabled = true
) {
  const client = useSupabase();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    const channel = client
      .channel(`workspace-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notes" },
        (payload) => {
          const change = payload as unknown as PostgresChange<NoteRow>;
          const row = change.eventType === "DELETE" ? change.old : change.new;
          if (
            shouldRefreshList(change.eventType, row.last_edited_by, userId)
          ) {
            onChangeRef.current();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "note_shares" },
        () => onChangeRef.current()
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, enabled, userId]);
}
