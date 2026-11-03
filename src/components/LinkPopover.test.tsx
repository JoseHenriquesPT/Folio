import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LinkPopover from "./LinkPopover";

const target = { href: "https://example.com/page", text: "Example" };
const anchor = { left: 100, top: 200, width: 80, height: 20 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LinkPopover", () => {
  it("shows the destination and opens it in a new tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const onClose = vi.fn();
    render(
      <LinkPopover target={target} anchor={anchor} onClose={onClose} />
    );

    expect(screen.getByText("https://example.com/page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open link" }));

    expect(open).toHaveBeenCalledWith(
      "https://example.com/page",
      "_blank",
      "noopener,noreferrer"
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("dismisses with Escape and with the close button", () => {
    const onClose = vi.fn();
    render(
      <LinkPopover target={target} anchor={anchor} onClose={onClose} />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss link" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps the caret out of the URL field on a phone", () => {
    render(
      <LinkPopover target={target} anchor={anchor} onClose={vi.fn()} />
    );

    expect(screen.getByRole("dialog").getAttribute("tabindex")).toBe("-1");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
