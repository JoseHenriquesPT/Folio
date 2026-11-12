import { useCallback, useEffect, type ClipboardEvent, type DragEvent } from "react";
import type { Editor } from "@tiptap/react";
import { createDownloadUrl } from "../db/attachments";
import type { DbClient } from "../db/supabase";
import {
  attachmentRef,
  isInlineImage,
  stripAttachmentRefs,
} from "../lib/attachments";
import { toMessage } from "../lib/errors";
import type { ConfirmOptions } from "../lib/confirm";
import type { NoteAttachment, useNoteAttachments } from "./useNoteAttachments";

type ToastLike = {
  push: (message: string, tone: "success" | "error" | "info") => void;
};

type ConfirmLike = (options: ConfirmOptions) => Promise<boolean>;

type Attachments = ReturnType<typeof useNoteAttachments>;

interface Options {
  client: DbClient;
  editor: Editor | null;
  attachments: Attachments;
  canEdit: boolean;
  noteSaved: boolean;
  toast: ToastLike;
  confirm: ConfirmLike;
  /** Receives note HTML with `attachment:` refs, ready to be stored. */
  onBodyChange: (bodyHtml: string) => void;
}

export function useAttachmentActions({
  client,
  editor,
  attachments,
  canEdit,
  noteSaved,
  toast,
  confirm,
  onBodyChange,
}: Options) {
  const {
    items,
    upload,
    remove: removeRow,
    restoreHtml,
    imageSrcFor,
    idForSrc,
  } = attachments;

  // Signed URLs expire; swap them for fresh ones without recording an edit.
  useEffect(() => {
    if (!editor) return;

    let tr = editor.state.tr;
    let changed = false;

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "image") return;
      const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
      const next = imageSrcFor(src);
      if (next && next !== src) {
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: next });
        changed = true;
      }
    });

    if (!changed) return;
    tr.setMeta("preventUpdate", true);
    editor.view.dispatch(tr);
  }, [editor, imageSrcFor, items]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!canEdit || !noteSaved || files.length === 0) return;

      const created = await upload(files);
      if (created.length === 0) return;

      for (const image of created) {
        if (!isInlineImage(image.mime_type) || !editor) continue;
        editor
          .chain()
          .focus()
          .setImage({ src: attachmentRef(image.id), alt: image.file_name })
          .run();
      }

      toast.push(
        created.length === 1 ? "File added." : `${created.length} files added.`,
        "success"
      );
    },
    [canEdit, editor, noteSaved, toast, upload]
  );

  /**
   * Saves a drawing as a new attachment and points the image in the note at
   * it. The original file stays in the note's attachment list, so annotating
   * never destroys the clean image.
   */
  const annotate = useCallback(
    async (source: NoteAttachment, file: File): Promise<boolean> => {
      if (!canEdit || !noteSaved || !editor) return false;

      const targets: { pos: number; attrs: Record<string, unknown> }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "image") return;
        const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
        if (idForSrc(src) !== source.id) return;
        targets.push({ pos, attrs: { ...node.attrs } });
      });

      if (targets.length === 0) {
        toast.push("The image is no longer in this note.", "error");
        return false;
      }

      const created = await upload([file]);
      const copy = created[0];
      if (!copy) return false;

      const nextSrc = attachmentRef(copy.id);
      let tr = editor.state.tr;
      for (const target of targets) {
        tr = tr.setNodeMarkup(target.pos, undefined, {
          ...target.attrs,
          src: nextSrc,
        });
      }
      editor.view.dispatch(tr);
      return true;
    },
    [canEdit, editor, idForSrc, noteSaved, toast, upload]
  );

  const remove = useCallback(
    async (item: NoteAttachment) => {
      const accepted = await confirm({
        title: "Remove file",
        message: `Remove ${item.file_name}? This cannot be undone.`,
        confirmLabel: "Remove file",
        tone: "danger",
      });
      if (!accepted) return;

      // Restore refs before deleting the row: once the URL is forgotten the
      // signed URL in the editor can no longer be mapped back to its file.
      const bodyHtml = stripAttachmentRefs(
        restoreHtml(editor?.getHTML() ?? ""),
        item.id
      );
      if (!(await removeRow(item))) return;

      onBodyChange(bodyHtml);
      toast.push("File removed.", "success");
    },
    [confirm, editor, onBodyChange, removeRow, restoreHtml, toast]
  );

  const download = useCallback(
    async (item: NoteAttachment) => {
      try {
        const url = await createDownloadUrl(client, item.storage_path, {
          downloadName: item.file_name,
        });
        const link = document.createElement("a");
        link.href = url;
        link.rel = "noopener";
        document.body.append(link);
        link.click();
        link.remove();
      } catch (nextError) {
        toast.push(toMessage(nextError), "error");
      }
    },
    [client, toast]
  );

  const dropTarget = {
    onPaste: (event: ClipboardEvent<HTMLDivElement>) => {
      const files = Array.from(event.clipboardData.files);
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files);
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!canEdit || !noteSaved) return;
      if (!Array.from(event.dataTransfer.types).includes("Files")) return;
      event.preventDefault();
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!canEdit || !noteSaved) return;
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files);
    },
  };

  return { addFiles, annotate, remove, download, dropTarget };
}
