import { useCallback, useEffect, useState } from "react";
import type { Note } from "../db/notes";
import { getPublicProfile } from "../db/profiles";
import { listShares } from "../db/shares";
import type { DbClient } from "../db/supabase";
import { toMessage } from "../lib/errors";

interface ToastLike {
  push: (message: string, tone: "success" | "error" | "info") => void;
}

export function useNoteSharing(
  client: DbClient,
  note: Note | null,
  userId: string,
  toast: ToastLike
) {
  const [shareCount, setShareCount] = useState(0);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [shareVersion, setShareVersion] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const noteId = note?.id;
  const ownerId = note?.owner_id;

  useEffect(() => {
    if (!ownerId || ownerId === userId) {
      setOwnerName(null);
      return;
    }

    let active = true;
    getPublicProfile(client, ownerId)
      .then((profile) => {
        if (active) setOwnerName(profile?.display_name ?? null);
      })
      .catch((nextError: unknown) => {
        if (active) toast.push(toMessage(nextError), "error");
      });

    return () => {
      active = false;
    };
  }, [client, ownerId, toast, userId]);

  useEffect(() => {
    if (!noteId || ownerId !== userId) {
      setShareCount(0);
      return;
    }

    let active = true;
    listShares(client, noteId)
      .then((rows) => {
        if (active) setShareCount(rows.length);
      })
      .catch((nextError: unknown) => {
        if (active) toast.push(toMessage(nextError), "error");
      });

    return () => {
      active = false;
    };
  }, [client, noteId, ownerId, shareVersion, toast, userId]);

  const openShare = useCallback(() => setShareOpen(true), []);
  const closeShare = useCallback(() => setShareOpen(false), []);
  const notifySharesChanged = useCallback(
    () => setShareVersion((value) => value + 1),
    []
  );

  return {
    shareCount,
    ownerName,
    shareOpen,
    shareVersion,
    openShare,
    closeShare,
    notifySharesChanged,
  };
}
