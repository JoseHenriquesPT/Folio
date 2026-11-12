import { useCallback, useMemo, useState } from "react";
import type { ImageAnnotation } from "../lib/imageAnnotate";
import { imageFromClick, type ViewerImage } from "../lib/imageView";
import type { NoteAttachment, useNoteAttachments } from "./useNoteAttachments";

interface ToastLike {
  push: (message: string, tone: "success" | "error" | "info") => void;
}

type Attachments = ReturnType<typeof useNoteAttachments>;

interface Options {
  attachments: Attachments;
  canAnnotate: boolean;
  annotate: (source: NoteAttachment, file: File) => Promise<boolean>;
  toast: ToastLike;
}

interface OpenImage {
  image: ViewerImage;
  attachmentId: string | null;
}

/**
 * The full-screen image viewer plus the one note-level action it can take:
 * replacing the displayed image with an annotated copy. The attachment id is
 * captured at open time so a signed-URL refresh while the viewer is open does
 * not lose track of the source file.
 */
export function useImageViewer({
  attachments,
  canAnnotate,
  annotate,
  toast,
}: Options) {
  const [open, setOpen] = useState<OpenImage | null>(null);
  const { idForSrc, items, loadBlob } = attachments;

  const openFromClick = useCallback(
    (target: EventTarget | null): boolean => {
      const image = imageFromClick(target);
      if (!image) return false;

      setOpen({ image, attachmentId: idForSrc(image.src) });
      return true;
    },
    [idForSrc]
  );

  const close = useCallback(() => setOpen(null), []);

  const source = useMemo(
    () =>
      open?.attachmentId
        ? items.find((item) => item.id === open.attachmentId) ?? null
        : null,
    [items, open]
  );

  const save = useCallback(
    async (attachment: NoteAttachment, file: File): Promise<boolean> => {
      const saved = await annotate(attachment, file);
      if (saved) toast.push("Drawing saved.", "success");
      return saved;
    },
    [annotate, toast]
  );

  const annotation = useMemo<ImageAnnotation | null>(() => {
    if (!canAnnotate || !source) return null;

    return {
      fileName: source.file_name,
      mimeType: source.mime_type,
      loadSource: () => loadBlob(source),
      save: (file) => save(source, file),
    };
  }, [canAnnotate, loadBlob, save, source]);

  return {
    image: open?.image ?? null,
    annotation,
    openFromClick,
    close,
  };
}
