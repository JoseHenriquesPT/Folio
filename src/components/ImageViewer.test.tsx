import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageViewer from "./ImageViewer";
import type { ImageAnnotation } from "../lib/imageAnnotate";

const image = { src: "https://files.example/a.png", alt: "A chart" };

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:photo") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
});

afterEach(() => {
  if (originalCreateObjectUrl) URL.createObjectURL = originalCreateObjectUrl;
  if (originalRevokeObjectUrl) URL.revokeObjectURL = originalRevokeObjectUrl;
});

function annotation(
  overrides: Partial<ImageAnnotation> = {}
): ImageAnnotation {
  return {
    fileName: "photo.png",
    mimeType: "image/png",
    loadSource: vi.fn(
      async () => new Blob(["pixels"], { type: "image/png" })
    ),
    save: vi.fn(async () => true),
    ...overrides,
  };
}

describe("ImageViewer", () => {
  it("shows the image in a labelled overlay", () => {
    render(<ImageViewer image={image} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Image viewer" });
    const shown = screen.getByAltText("A chart");
    expect(shown.getAttribute("src")).toBe(image.src);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<ImageViewer image={image} onClose={onClose} />);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on a tap anywhere: the image, the overlay, or the button", async () => {
    const onClose = vi.fn();
    render(<ImageViewer image={image} onClose={onClose} />);

    await userEvent.click(screen.getByAltText("A chart"));
    expect(onClose).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("offers Draw only when the image can be annotated", () => {
    const view = render(<ImageViewer image={image} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Draw" })).toBeNull();

    view.rerender(
      <ImageViewer
        image={image}
        annotation={annotation()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Draw" })).not.toBeNull();
  });

  it("opens the drawing tools without closing the viewer", async () => {
    const onClose = vi.fn();
    const source = annotation();
    render(
      <ImageViewer image={image} annotation={source} onClose={onClose} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Draw" }));

    expect(
      await screen.findByRole("toolbar", { name: "Drawing tools" })
    ).not.toBeNull();
    expect(source.loadSource).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves drawing on Escape before closing the viewer", async () => {
    const onClose = vi.fn();
    render(
      <ImageViewer image={image} annotation={annotation()} onClose={onClose} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Draw" }));
    await screen.findByRole("toolbar", { name: "Drawing tools" });

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("toolbar", { name: "Drawing tools" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("returns to the plain image when drawing is cancelled", async () => {
    const onClose = vi.fn();
    render(
      <ImageViewer image={image} annotation={annotation()} onClose={onClose} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Draw" }));
    await screen.findByRole("toolbar", { name: "Drawing tools" });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("toolbar", { name: "Drawing tools" })).toBeNull();
    expect(screen.getByRole("button", { name: "Draw" })).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still closes from the close button while drawing", async () => {
    const onClose = vi.fn();
    render(
      <ImageViewer image={image} annotation={annotation()} onClose={onClose} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Draw" }));
    await screen.findByRole("toolbar", { name: "Drawing tools" });

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows why an image could not be prepared for drawing", async () => {
    const source = annotation({
      loadSource: vi.fn(async () => {
        throw new Error("Storage is offline.");
      }),
    });
    render(<ImageViewer image={image} annotation={source} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Draw" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Storage is offline."
    );
    expect(screen.queryByRole("toolbar", { name: "Drawing tools" })).toBeNull();
  });
});
