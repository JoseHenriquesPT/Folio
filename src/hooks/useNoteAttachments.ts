import { useCallback, useEffect, useRef, useState } from "react";
import type { DbClient } from "../db/supabase";
import {
  createSignedUrls,
  deleteAttachment,
  listAttachments,
  removeAttachmentObject,
  uploadAttachment,
  type Attachment,
} from "../db/attachments";
import {
  SIGNED_URL_SECONDS,
  attachmentRejection,
  isInlineImage,
  nextAttachmentSrc,
  resolveAttachmentRefs,
  restoreAttachmentRefs,
  signedUrlRefreshDelay,
} from "../lib/attachments";
import { toMessage } from "../lib/errors";

interface ToastLike {
  push: (message: string, tone: "success" | "error" | "info") => void;
}

export interface NoteAttachment extends Attachment {
  url: string | null;
  isImage: boolean;
}

interface Options {
  client: DbClient;
  noteId: string | null;
  canEdit: boolean;
  isOwner: boolean;
  toast: ToastLike;
  expiresIn?: number;
}

export type CleanupResult =
  | { ok: true; removed: number }
  | { ok: false; error: unknown };

export function useNoteAttachments({
  client,
  noteId,
  canEdit,
  isOwner,
  toast,
  expiresIn = SIGNED_URL_SECONDS,
}: Options) {
  const [items, setItems] = useState<NoteAttachment[]>([]);
  const [loading, setLoading] = useState(Boolean(noteId));
  const [loadedNoteId, setLoadedNoteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const generation = useRef(0);
  const currentUrls = useRef<Record<string, string>>({});
  const previousUrls = useRef<Record<string, string>>({});

  const signImages = useCallback(
    async (rows: Attachment[]): Promise<NoteAttachment[]> => {
      const imagePaths = rows
        .filter((row) => isInlineImage(row.mime_type))
        .map((row) => row.storage_path);
      const urls = await createSignedUrls(client, imagePaths, expiresIn);

      previousUrls.current = currentUrls.current;
      const merged = { ...currentUrls.current };
      for (const row of rows) {
        const url = urls.get(row.storage_path);
        if (url) merged[row.id] = url;
      }
      currentUrls.current = merged;

      return rows.map((row) => ({
        ...row,
        isImage: isInlineImage(row.mime_type),
        url: urls.get(row.storage_path) ?? null,
      }));
    },
    [client, expiresIn]
  );

  useEffect(() => {
    generation.current += 1;
    const current = generation.current;

    if (!noteId) {
      setItems([]);
      setLoading(false);
      setLoadedNoteId(null);
      return;
    }

    let active = true;
    setLoading(true);

    listAttachments(client, noteId)
      .then((rows) => signImages(rows))
      .then((signed) => {
        if (active && generation.current === current) setItems(signed);
      })
      .catch((nextError: unknown) => {
        if (active) toast.push(toMessage(nextError), "error");
      })
      .finally(() => {
        if (active && generation.current === current) {
          setLoading(false);
          setLoadedNoteId(noteId);
        }
      });

    return () => {
      active = false;
    };
  }, [client, noteId, reloadKey, signImages, toast]);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    if (!noteId || !items.some((item) => item.isImage)) return;
    const delay = signedUrlRefreshDelay(expiresIn);
    const timer = setTimeout(refresh, delay);
    return () => clearTimeout(timer);
  }, [expiresIn, items, noteId, refresh]);

  const upload = useCallback(
    async (files: File[]): Promise<Attachment[]> => {
      if (!noteId || !canEdit || files.length === 0) return [];

      const accepted: File[] = [];
      const problems: string[] = [];
      for (const file of files) {
        const problem = attachmentRejection(file);
        if (problem) problems.push(problem);
        else accepted.push(file);
      }

      if (problems.length > 0) toast.push(problems.join(" "), "error");
      if (accepted.length === 0) return [];

      setUploading(true);
      try {
        const created: Attachment[] = [];
        for (const file of accepted) {
          created.push(await uploadAttachment(client, { noteId, file }));
        }
        setItems(await signImages(await listAttachments(client, noteId)));
        return created;
      } catch (nextError) {
        toast.push(toMessage(nextError), "error");
        return [];
      } finally {
        setUploading(false);
      }
    },
    [canEdit, client, noteId, signImages, toast]
  );

  const remove = useCallback(
    async (attachment: NoteAttachment): Promise<boolean> => {
      if (!isOwner) return false;

      try {
        await removeAttachmentObject(client, [attachment.storage_path]);
        await deleteAttachment(client, attachment.id);
        setItems((current) => current.filter((item) => item.id !== attachment.id));
        delete currentUrls.current[attachment.id];
        delete previousUrls.current[attachment.id];
        return true;
      } catch (nextError) {
        toast.push(toMessage(nextError), "error");
        return false;
      }
    },
    [client, isOwner, toast]
  );

  const removeAll = useCallback(async (): Promise<CleanupResult> => {
    if (!noteId) return { ok: true, removed: 0 };

    try {
      const rows = await listAttachments(client, noteId);
      if (rows.length === 0) return { ok: true, removed: 0 };
      await removeAttachmentObject(
        client,
        rows.map((row) => row.storage_path)
      );
      return { ok: true, removed: rows.length };
    } catch (error) {
      return { ok: false, error };
    }
  }, [client, noteId]);

  const resolveHtml = useCallback(
    (html: string) => resolveAttachmentRefs(html, currentUrls.current),
    []
  );

  const restoreHtml = useCallback(
    (html: string) =>
      restoreAttachmentRefs(html, {
        ...previousUrls.current,
        ...currentUrls.current,
      }),
    []
  );

  const imageSrcFor = useCallback(
    (src: string) =>
      nextAttachmentSrc(src, currentUrls.current, previousUrls.current),
    []
  );

  return {
    items,
    loading,
    loadedNoteId,
    uploading,
    upload,
    remove,
    removeAll,
    refresh,
    resolveHtml,
    restoreHtml,
    imageSrcFor,
  };
}
