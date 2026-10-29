import { act, renderHook } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../test/fakeDb";
import type { NoteAttachment, useNoteAttachments } from "./useNoteAttachments";
import { useAttachmentActions } from "./useAttachmentActions";

const toast = { push: vi.fn() };
const confirm = vi.fn(async () => true);

// TipTap's Editor is far too large to construct in a unit test; this double
// covers only the surface the hook touches.
function editorDouble(html = "") {
  const setImage = vi.fn();
  const dispatch = vi.fn();
  const tr = {
    setNodeMarkup: () => tr,
    setMeta: () => tr,
  };
  const double = {
    getHTML: () => html,
    state: { tr, doc: { descendants: () => undefined } },
    view: { dispatch },
    chain: () => ({
      focus: () => ({
        setImage: (attrs: unknown) => {
          setImage(attrs);
          return { run: () => true };
        },
      }),
    }),
  };

  return { editor: double as unknown as Editor, setImage, dispatch };
}

function attachment(
  overrides: Partial<NoteAttachment> = {}
): NoteAttachment {
  return {
    id: "attachment-1",
    note_id: "note-1",
    owner_id: "user-1",
    storage_path: "note-1/attachment-1.png",
    file_name: "photo.png",
    mime_type: "image/png",
    size_bytes: 1024,
    created_at: "2026-01-01T00:00:00Z",
    url: null,
    isImage: true,
    ...overrides,
  };
}

type Attachments = ReturnType<typeof useNoteAttachments>;

function attachmentsDouble(overrides: Partial<Attachments> = {}): Attachments {
  return {
    items: [],
    loading: false,
    loadedNoteId: "note-1",
    uploading: false,
    upload: vi.fn(async () => []),
    remove: vi.fn(async () => true),
    removeAll: vi.fn(async () => ({ ok: true, removed: 0 })),
    refresh: vi.fn(),
    resolveHtml: (html: string) => html,
    restoreHtml: (html: string) => html,
    imageSrcFor: () => null,
    ...overrides,
  } as Attachments;
}

beforeEach(() => {
  toast.push.mockClear();
  confirm.mockReset();
  confirm.mockResolvedValue(true);
});

describe("useAttachmentActions", () => {
  it("strips an image that the editor holds as a signed URL", async () => {
    const onBodyChange = vi.fn();
    const { editor } = editorDouble('<img src="https://signed/photo">');
    const attachments = attachmentsDouble({
      restoreHtml: () => '<img src="attachment:attachment-1">',
    });

    const { result } = renderHook(() =>
      useAttachmentActions({
        client: createFakeDb().client,
        editor,
        attachments,
        canEdit: true,
        noteSaved: true,
        toast,
        confirm,
        onBodyChange,
      })
    );

    await act(async () => {
      await result.current.remove(attachment());
    });

    expect(onBodyChange).toHaveBeenCalledWith("");
    expect(toast.push).toHaveBeenCalledWith("File removed.", "success");
  });

  it("keeps the note untouched when the delete fails", async () => {
    const onBodyChange = vi.fn();
    const { editor } = editorDouble("");
    const attachments = attachmentsDouble({ remove: vi.fn(async () => false) });

    const { result } = renderHook(() =>
      useAttachmentActions({
        client: createFakeDb().client,
        editor,
        attachments,
        canEdit: true,
        noteSaved: true,
        toast,
        confirm,
        onBodyChange,
      })
    );

    await act(async () => {
      await result.current.remove(attachment());
    });

    expect(onBodyChange).not.toHaveBeenCalled();
  });

  it("leaves the file alone when the removal is declined", async () => {
    confirm.mockResolvedValue(false);
    const onBodyChange = vi.fn();
    const { editor } = editorDouble("");
    const remove = vi.fn(async () => true);
    const attachments = attachmentsDouble({ remove });

    const { result } = renderHook(() =>
      useAttachmentActions({
        client: createFakeDb().client,
        editor,
        attachments,
        canEdit: true,
        noteSaved: true,
        toast,
        confirm,
        onBodyChange,
      })
    );

    await act(async () => {
      await result.current.remove(attachment());
    });

    expect(confirm).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
    expect(onBodyChange).not.toHaveBeenCalled();
    expect(toast.push).not.toHaveBeenCalled();
  });

  it("inserts an inline image for raster uploads only", async () => {
    const { editor, setImage } = editorDouble("");
    const attachments = attachmentsDouble({
      upload: vi.fn(async () => [
        attachment(),
        attachment({
          id: "attachment-2",
          file_name: "file.pdf",
          mime_type: "application/pdf",
        }),
      ]),
    });

    const { result } = renderHook(() =>
      useAttachmentActions({
        client: createFakeDb().client,
        editor,
        attachments,
        canEdit: true,
        noteSaved: true,
        toast,
        confirm,
        onBodyChange: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.addFiles([
        new File(["a"], "photo.png", { type: "image/png" }),
      ]);
    });

    expect(setImage).toHaveBeenCalledExactlyOnceWith({
      src: "attachment:attachment-1",
      alt: "photo.png",
    });
    expect(toast.push).toHaveBeenCalledWith("2 files added.", "success");
  });

  it("waits for a first save before uploading", async () => {
    const upload = vi.fn(async () => []);
    const { editor } = editorDouble("");

    const { result } = renderHook(() =>
      useAttachmentActions({
        client: createFakeDb().client,
        editor,
        attachments: attachmentsDouble({ upload }),
        canEdit: true,
        noteSaved: false,
        toast,
        confirm,
        onBodyChange: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.addFiles([
        new File(["a"], "photo.png", { type: "image/png" }),
      ]);
    });

    expect(upload).not.toHaveBeenCalled();
  });
});
