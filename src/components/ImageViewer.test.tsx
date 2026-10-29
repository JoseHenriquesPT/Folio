import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ImageViewer from "./ImageViewer";

const image = { src: "https://files.example/a.png", alt: "A chart" };

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
});
