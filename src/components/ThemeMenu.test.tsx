import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PaletteId } from "../lib/palette";
import type { ThemeMode } from "../lib/theme";
import ThemeMenu from "./ThemeMenu";

function setup() {
  const onModeChange = vi.fn<(mode: ThemeMode) => void>();
  const onPaletteChange = vi.fn<(palette: PaletteId) => void>();
  render(
    <ThemeMenu
      mode="light"
      palette="sage"
      onModeChange={onModeChange}
      onPaletteChange={onPaletteChange}
    />
  );
  const trigger = screen.getByRole("button", { name: "Appearance" });
  return { onModeChange, onPaletteChange, trigger };
}

describe("ThemeMenu", () => {
  it("opens the appearance popover from the trigger", async () => {
    const { trigger } = setup();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const user = userEvent.setup();

    await user.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const popover = screen.getByRole("dialog", { name: "Appearance" });
    expect(popover).toBeTruthy();
    expect(popover.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { trigger } = setup();
    const user = userEvent.setup();
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Appearance" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on an outside press", async () => {
    const { trigger } = setup();
    const user = userEvent.setup();
    await user.click(trigger);

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("dialog", { name: "Appearance" })).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the popover open while choosing, for a live preview", async () => {
    const { onPaletteChange, trigger } = setup();
    const user = userEvent.setup();
    await user.click(trigger);

    await user.click(screen.getByRole("button", { name: "Ocean" }));

    expect(onPaletteChange).toHaveBeenCalledExactlyOnceWith("ocean");
    expect(screen.getByRole("dialog", { name: "Appearance" })).toBeTruthy();
  });
});
