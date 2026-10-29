import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LinkDialog from "./LinkDialog";
import type { LinkChoice } from "../lib/linkUrl";

function setup(initialValue = "") {
  const onDecide = vi.fn<(choice: LinkChoice) => void>();
  render(
    <LinkDialog open initialValue={initialValue} onDecide={onDecide} />
  );
  return { onDecide };
}

describe("LinkDialog", () => {
  it("pre-fills the current URL and focuses the field", async () => {
    setup("https://example.com");

    const input = screen.getByRole("textbox", { name: "Link URL" });
    expect(input.getAttribute("value")).toBe("https://example.com");
    expect(document.activeElement).toBe(input);
  });

  it("applies the typed URL on Enter", async () => {
    const { onDecide } = setup();
    const user = userEvent.setup();

    await user.type(
      screen.getByRole("textbox", { name: "Link URL" }),
      "example.com{Enter}"
    );

    expect(onDecide).toHaveBeenCalledExactlyOnceWith({
      action: "set",
      href: "https://example.com",
    });
  });

  it("applies the typed URL on the Apply button", async () => {
    const { onDecide } = setup();
    const user = userEvent.setup();

    await user.type(
      screen.getByRole("textbox", { name: "Link URL" }),
      "https://example.com/x"
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onDecide).toHaveBeenCalledExactlyOnceWith({
      action: "set",
      href: "https://example.com/x",
    });
  });

  it("clears the link when the field is emptied", async () => {
    const { onDecide } = setup("https://example.com");
    const user = userEvent.setup();

    await user.clear(screen.getByRole("textbox", { name: "Link URL" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onDecide).toHaveBeenCalledExactlyOnceWith({ action: "clear" });
  });

  it("cancels on Escape, the Cancel button, and a backdrop tap", async () => {
    const { onDecide } = setup();
    const user = userEvent.setup();

    await user.keyboard("{Escape}");
    expect(onDecide).toHaveBeenCalledExactlyOnceWith({ action: "cancel" });

    onDecide.mockClear();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDecide).toHaveBeenCalledExactlyOnceWith({ action: "cancel" });

    onDecide.mockClear();
    const backdrop = screen.getByRole("dialog").parentElement;
    if (!backdrop) throw new Error("link dialog has no backdrop");
    fireEvent.mouseDown(backdrop);
    expect(onDecide).toHaveBeenCalledExactlyOnceWith({ action: "cancel" });
  });
});
