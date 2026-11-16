import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiAuditEntry } from "../db/apiAudit";
import type { ApiAuditController } from "../hooks/useApiAudit";
import { ConfirmProvider } from "./ConfirmProvider";
import ExternalAuditPanel from "./ExternalAuditPanel";

const NOW = new Date("2026-11-16T12:00:00.000Z");

function entry(overrides: Partial<ApiAuditEntry> = {}): ApiAuditEntry {
  return {
    id: 7,
    tool: "update_note",
    status: "ok",
    noteIds: ["note-1"],
    noteTitles: ["Lisbon"],
    summary: { title: "Lisbon", version_to: 2 },
    tokenName: "Owner write",
    tokenPrefix: "folio_pat_ab12cd",
    createdAt: "2026-11-15T12:00:00.000Z",
    canUndo: true,
    ...overrides,
  };
}

function controller(
  overrides: Partial<ApiAuditController> = {}
): ApiAuditController {
  return {
    enabled: true,
    audit: [],
    loading: false,
    error: null,
    busyId: null,
    undo: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPanel(state: ApiAuditController = controller()) {
  return render(
    <ConfirmProvider>
      <ExternalAuditPanel controller={state} now={() => NOW} />
    </ConfirmProvider>
  );
}

describe("ExternalAuditPanel", () => {
  it("renders nothing when the viewer is disabled", () => {
    const { container } = renderPanel(controller({ enabled: false }));

    expect(container.innerHTML).toBe("");
  });

  it("shows the empty state", () => {
    renderPanel();

    expect(screen.getByText("Recent external changes (0)")).toBeTruthy();
    expect(screen.getByText("No external changes yet.")).toBeTruthy();
  });

  it("lists an external update with its token and title", () => {
    renderPanel(controller({ audit: [entry()] }));

    expect(screen.getByText("Lisbon")).toBeTruthy();
    expect(screen.getByText(/Updated note/)).toBeTruthy();
    expect(screen.getByText(/Owner write/)).toBeTruthy();
    expect(screen.getByText("1 d ago")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("does not offer undo for a non-undoable row", () => {
    renderPanel(controller({ audit: [entry({ canUndo: false })] }));

    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("confirms before undoing a change", async () => {
    const state = controller({ audit: [entry()] });
    renderPanel(state);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Restore “Lisbon”/)).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Undo change" })
    );

    await waitFor(() => expect(state.undo).toHaveBeenCalledWith(7));
  });

  it("shows a controller error", () => {
    renderPanel(controller({ error: "Network down" }));

    expect(screen.getByRole("alert").textContent).toContain("Network down");
  });
});
