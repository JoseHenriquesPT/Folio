import { useCallback, useEffect, useState } from "react";
import type { DbClient } from "../db/supabase";
import {
  attachTag,
  detachTag,
  listNoteTags,
  type Tag,
  type TagSummary,
} from "../db/tags";
import { toMessage } from "../lib/errors";

interface ToastLike {
  push: (message: string, tone: "success" | "error" | "info") => void;
}

interface Options {
  client: DbClient;
  noteId: string | null;
  canManage: boolean;
  toast: ToastLike;
  /** Refreshes the workspace tag list after a change. */
  onTagsChanged: () => void;
}

export function useNoteTags({
  client,
  noteId,
  canManage,
  toast,
  onTagsChanged,
}: Options) {
  const [noteTags, setNoteTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (!noteId) {
      setNoteTags([]);
      return;
    }

    let active = true;
    listNoteTags(client, noteId)
      .then((rows) => {
        if (active) setNoteTags(rows);
      })
      .catch((nextError: unknown) => {
        if (active) toast.push(toMessage(nextError), "error");
      });

    return () => {
      active = false;
    };
  }, [client, noteId, toast]);

  const toggle = useCallback(
    async (tag: TagSummary) => {
      if (!noteId || !canManage) return;

      try {
        if (noteTags.some((item) => item.id === tag.id)) {
          await detachTag(client, noteId, tag.id);
          setNoteTags((current) =>
            current.filter((item) => item.id !== tag.id)
          );
        } else {
          await attachTag(client, noteId, tag.id);
          setNoteTags((current) => [...current, tag]);
        }
        onTagsChanged();
      } catch (nextError) {
        toast.push(toMessage(nextError), "error");
      }
    },
    [canManage, client, noteId, noteTags, onTagsChanged, toast]
  );

  return { noteTags, toggle };
}
