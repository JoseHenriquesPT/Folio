import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PALETTES, type PaletteId } from "../lib/palette";
import type { ThemeMode } from "../lib/theme";
import ThemePicker from "./ThemePicker";

function setup(mode: ThemeMode = "light", palette: PaletteId = "sage") {
  const onModeChange = vi.fn<(mode: ThemeMode) => void>();
  const onPaletteChange = vi.fn<(palette: PaletteId) => void>();
  render(
    <ThemePicker
      mode={mode}
      palette={palette}
      onModeChange={onModeChange}
      onPaletteChange={onPaletteChange}
    />
  );
  return { onModeChange, onPaletteChange };
}

describe("ThemePicker", () => {
  it("offers the three modes with the current one pressed", () => {
    setup("dark");

    const group = screen.getByRole("group", { name: "Mode" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("button", { name: "Light" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "System" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("offers every palette with the current one pressed", () => {
    setup("light", "ocean");

    const group = screen.getByRole("group", { name: "Color theme" });
    expect(group).toBeTruthy();
    for (const palette of PALETTES) {
      const button = screen.getByRole("button", { name: palette.label });
      expect(button.getAttribute("aria-pressed")).toBe(
        palette.id === "ocean" ? "true" : "false"
      );
    }
  });

  it("reports mode and palette choices", async () => {
    const { onModeChange, onPaletteChange } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "System" }));
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith("system");

    await user.click(screen.getByRole("button", { name: "Rose" }));
    expect(onPaletteChange).toHaveBeenCalledExactlyOnceWith("rose");
  });
});
