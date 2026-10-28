import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NoteAttachment } from "../hooks/useNoteAttachments";
import AttachmentArea from "./AttachmentArea";

function attachment(overrides: Partial<NoteAttachment> = {}): NoteAttachment {
  return {
    id: "attachment-1",
    note_id: "note-1",
    owner_id: "user-1",
    storage_path: "note-1/attachment-1.pdf",
    file_name: "report.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    created_at: "2026-01-01T00:00:00Z",
    url: null,
    isImage: false,
    ...overrides,
  };
}

const baseProps = {
  items: [],
  loading: false,
  uploading: false,
  canEdit: true,
  isOwner: true,
  noteSaved: true,
  onUpload: vi.fn(),
  onRemove: vi.fn(),
  onDownload: vi.fn(),
};

describe("AttachmentArea", () => {
  it("renders nothing for a reader on a note without files", () => {
    const { container } = render(
      <AttachmentArea {...baseProps} canEdit={false} isOwner={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("lists files with name, size, and download", () => {
    render(<AttachmentArea {...baseProps} items={[attachment()]} />);

    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("2 KB")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(baseProps.onDownload).toHaveBeenCalledOnce();
  });

  it("offers upload to an editor but no remove", () => {
    render(
      <AttachmentArea
        {...baseProps}
        isOwner={false}
        items={[attachment()]}
      />
    );

    expect(screen.getByRole("button", { name: "Add files" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("lets the owner remove a file", () => {
    const onRemove = vi.fn();
    render(
      <AttachmentArea
        {...baseProps}
        items={[attachment()]}
        onRemove={onRemove}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("passes picked files to the upload handler", () => {
    const onUpload = vi.fn();
    render(<AttachmentArea {...baseProps} onUpload={onUpload} />);

    const file = new File(["hello"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Add files"), {
      target: { files: [file] },
    });

    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it("asks for a first save before a new note can take files", () => {
    render(<AttachmentArea {...baseProps} noteSaved={false} />);

    expect(screen.getByText("Save the note once to add files.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add files" })).toBeNull();
  });

  it("shows a thumbnail for images", () => {
    render(
      <AttachmentArea
        {...baseProps}
        items={[
          attachment({
            file_name: "photo.png",
            mime_type: "image/png",
            url: "https://example.test/photo",
            isImage: true,
          }),
        ]}
      />
    );

    const image = screen.getByRole("presentation");
    expect(image.getAttribute("src")).toBe("https://example.test/photo");
  });
});
