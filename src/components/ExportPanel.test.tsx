import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ExportPanel from "./ExportPanel";
import type { VaultExportController } from "../hooks/useVaultExport";

function controller(overrides: Partial<VaultExportController> = {}): VaultExportController {
  return {
    running: false,
    phase: null,
    completed: 0,
    total: 0,
    error: null,
    start: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  };
}

describe("ExportPanel", () => {
  it("offers the vault zip and the JSON backup", () => {
    const state = controller();
    render(<ExportPanel controller={state} />);

    fireEvent.click(screen.getByRole("button", { name: "Download vault zip" }));
    fireEvent.click(screen.getByRole("button", { name: "Download JSON backup" }));

    expect(state.start).toHaveBeenNthCalledWith(1, "vault");
    expect(state.start).toHaveBeenNthCalledWith(2, "json");
  });

  it("shows progress and a cancel button while an export runs", () => {
    const state = controller({
      running: true,
      phase: "downloading",
      completed: 4,
      total: 10,
    });
    render(<ExportPanel controller={state} />);

    expect(screen.getByText("Downloading attachments…")).toBeTruthy();
    expect(screen.getByText("4 of 10")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");

    expect(
      (screen.getByRole("button", { name: "Download vault zip" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
    expect(state.cancel).toHaveBeenCalled();
  });

  it("describes the notes and packing phases", () => {
    const { rerender } = render(
      <ExportPanel controller={controller({ running: true, phase: "loading" })} />
    );
    expect(screen.getByText("Collecting your notes…")).toBeTruthy();

    rerender(
      <ExportPanel controller={controller({ running: true, phase: "packing" })} />
    );
    expect(screen.getByText("Packing the archive…")).toBeTruthy();
  });

  it("shows an export error", () => {
    render(<ExportPanel controller={controller({ error: "Network down" })} />);

    expect(screen.getByRole("alert").textContent).toContain("Network down");
  });
});
