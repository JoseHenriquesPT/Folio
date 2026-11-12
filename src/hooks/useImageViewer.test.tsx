import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteAttachment, useNoteAttachments } from "./useNoteAttachments";
import { useImageViewer } from "./useImageViewer";

const toast = { push: vi.fn() };

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
    url: "https://files.example/photo",
    isImage: true,
    ...overrides,
  };
}

type Attachments = ReturnType<typeof useNoteAttachments>;

function attachmentsDouble(overrides: Partial<Attachments> = {}): Attachments {
  return {
    items: [attachment()],
    loading: false,
    loadedNoteId: "note-1",
    uploading: false,
    upload: vi.fn(async () => []),
    remove: vi.fn(async () => true),
    removeAll: vi.fn(async () => ({ ok: true as const, removed: 0 })),
    refresh: vi.fn(),
    resolveHtml: (html: string) => html,
    restoreHtml: (html: string) => html,
    imageSrcFor: () => "https://files.example/photo",
    idForSrc: (src: string) =>
      src === "https://files.example/photo" ? "attachment-1" : null,
    loadBlob: vi.fn(async () => new Blob(["pixels"], { type: "image/png" })),
    ...overrides,
  };
}

function noteImage(): HTMLImageElement {
  const editor = document.createElement("div");
  editor.className = "tiptap";
  editor.innerHTML =
    '<p><img src="https://files.example/photo" alt="A chart"></p>';
  return editor.querySelector("img")!;
}

const options = (overrides: Record<string, unknown> = {}) => ({
  attachments: attachmentsDouble(),
  canAnnotate: true,
  annotate: vi.fn(async () => true),
  toast,
  ...overrides,
});

beforeEach(() => {
  toast.push.mockClear();
});

describe("useImageViewer", () => {
  it("opens a note image and offers its attachment for drawing", async () => {
    const loadBlob = vi.fn(
      async () => new Blob(["pixels"], { type: "image/png" })
    );
    const attachments = attachmentsDouble({ loadBlob });
    const { result } = renderHook(() =>
      useImageViewer(options({ attachments }))
    );

    let opened = false;
    act(() => {
      opened = result.current.openFromClick(noteImage());
    });

    expect(opened).toBe(true);
    expect(result.current.image).toEqual({
      src: "https://files.example/photo",
      alt: "A chart",
    });
    expect(result.current.annotation).toMatchObject({
      fileName: "photo.png",
      mimeType: "image/png",
    });

    await expect(result.current.annotation?.loadSource()).resolves.toBeInstanceOf(
      Blob
    );
    expect(loadBlob).toHaveBeenCalledWith(attachment());
  });

  it("keeps the viewer read-only when the note cannot be edited", () => {
    const { result } = renderHook(() =>
      useImageViewer(options({ canAnnotate: false }))
    );

    act(() => {
      result.current.openFromClick(noteImage());
    });

    expect(result.current.image).not.toBeNull();
    expect(result.current.annotation).toBeNull();
  });

  it("offers no drawing for an image that is not an attachment", () => {
    const attachments = attachmentsDouble({ idForSrc: () => null });
    const { result } = renderHook(() =>
      useImageViewer(options({ attachments }))
    );

    act(() => {
      result.current.openFromClick(noteImage());
    });

    expect(result.current.annotation).toBeNull();
  });

  it("saves the drawing through the annotate action and announces it", async () => {
    const annotate = vi.fn(async () => true);
    const { result } = renderHook(() => useImageViewer(options({ annotate })));

    act(() => {
      result.current.openFromClick(noteImage());
    });

    const file = new File(["drawing"], "photo (annotated).png", {
      type: "image/png",
    });
    let saved = false;
    await act(async () => {
      saved = await result.current.annotation!.save(file);
    });

    expect(saved).toBe(true);
    expect(annotate).toHaveBeenCalledWith(attachment(), file);
    expect(toast.push).toHaveBeenCalledWith("Drawing saved.", "success");
  });

  it("stays quiet when the drawing could not be saved", async () => {
    const annotate = vi.fn(async () => false);
    const { result } = renderHook(() => useImageViewer(options({ annotate })));

    act(() => {
      result.current.openFromClick(noteImage());
    });

    let saved = true;
    await act(async () => {
      saved = await result.current.annotation!.save(
        new File(["drawing"], "photo (annotated).png", { type: "image/png" })
      );
    });

    expect(saved).toBe(false);
    expect(toast.push).not.toHaveBeenCalled();
  });

  it("ignores clicks that are not on a note image and closes on demand", () => {
    const { result } = renderHook(() => useImageViewer(options()));

    expect(result.current.openFromClick(document.body)).toBe(false);
    expect(result.current.image).toBeNull();

    act(() => {
      result.current.openFromClick(noteImage());
    });
    expect(result.current.image).not.toBeNull();

    act(() => {
      result.current.close();
    });
    expect(result.current.image).toBeNull();
    expect(result.current.annotation).toBeNull();
  });
});
