import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiTokenSummary } from "../db/apiTokens";
import type { ApiTokensController } from "../hooks/useApiTokens";
import { tokenExpiryDate } from "../lib/apiTokens";
import { ConfirmProvider } from "./ConfirmProvider";
import ExternalAccessPanel from "./ExternalAccessPanel";

const NOW = new Date("2026-11-12T12:00:00.000Z");

function token(overrides: Partial<ApiTokenSummary> = {}): ApiTokenSummary {
  return {
    id: "token-1",
    name: "Desktop",
    prefix: "folio_pat_ab12cd",
    scope: "read",
    createdAt: "2026-11-12T12:00:00.000Z",
    lastUsedAt: null,
    expiresAt: "2027-02-10T12:00:00.000Z",
    revokedAt: null,
    callsToday: 0,
    ...overrides,
  };
}

function controller(
  overrides: Partial<ApiTokensController> = {}
): ApiTokensController {
  return {
    canManage: true,
    tokens: [],
    loading: false,
    error: null,
    busy: false,
    created: null,
    create: vi.fn().mockResolvedValue(true),
    revoke: vi.fn().mockResolvedValue(true),
    dismissCreated: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
    ...overrides,
  };
}

function renderPanel(state: ApiTokensController = controller()) {
  return render(
    <ConfirmProvider>
      <ExternalAccessPanel controller={state} now={() => NOW} />
    </ConfirmProvider>
  );
}

describe("ExternalAccessPanel", () => {
  it("renders nothing unless the account can manage tokens", () => {
    const { container } = renderPanel(controller({ canManage: false }));
    expect(container.innerHTML).toBe("");

    const second = renderPanel(controller({ canManage: null }));
    expect(second.container.innerHTML).toBe("");
  });

  it("lists tokens with scope, status and usage", () => {
    renderPanel(
      controller({
        tokens: [
          token(),
          token({
            id: "token-2",
            name: "Old laptop",
            expiresAt: "2026-01-01T00:00:00.000Z",
          }),
          token({
            id: "token-3",
            name: "Lost phone",
            revokedAt: "2026-11-01T00:00:00.000Z",
          }),
        ],
      })
    );

    expect(screen.getByText("Desktop")).toBeTruthy();
    expect(screen.getByText("Old laptop")).toBeTruthy();
    expect(screen.getByText("Lost phone")).toBeTruthy();
    expect(screen.getAllByText(/Read only/)).toHaveLength(3);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("Revoked")).toBeTruthy();
    expect(screen.getAllByText(/Never used/)).toHaveLength(3);
    expect(screen.getAllByText(/0 calls today/)).toHaveLength(3);
  });

  it("shows an empty state before the first token", () => {
    renderPanel();

    expect(screen.getByText(/No tokens yet/)).toBeTruthy();
  });

  it("creates a token with the chosen scope and expiry", async () => {
    const state = controller();
    renderPanel(state);

    fireEvent.click(screen.getByRole("button", { name: "New token" }));
    const dialog = screen.getByRole("dialog", {
      name: "Create access token",
    });

    fireEvent.change(within(dialog).getByLabelText("Device name"), {
      target: { value: "Laptop" },
    });
    fireEvent.change(within(dialog).getByLabelText("Access"), {
      target: { value: "write" },
    });
    fireEvent.change(within(dialog).getByLabelText("Expires"), {
      target: { value: "30" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create token" })
    );

    await waitFor(() =>
      expect(state.create).toHaveBeenCalledWith({
        name: "Laptop",
        scope: "write",
        expiresAt: tokenExpiryDate(30, NOW),
      })
    );
  });

  it("shows the raw token once and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderPanel(
      controller({
        created: {
          id: "token-2",
          token: "folio_pat_secret",
          name: "Laptop",
          prefix: "folio_pat_secret",
          scope: "read",
          expiresAt: "2027-02-10T12:00:00.000Z",
        },
      })
    );

    expect(
      screen.getByRole("dialog", { name: "Copy access token" })
    ).toBeTruthy();
    expect(screen.getByText("folio_pat_secret")).toBeTruthy();
    expect(screen.getByText(/will not be shown again/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy token" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("folio_pat_secret")
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("confirms before revoking a token", async () => {
    const state = controller({ tokens: [token()] });
    renderPanel(state);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("alertdialog");

    expect(within(dialog).getByText(/Any client using it will stop/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Revoke token" })
    );

    await waitFor(() => expect(state.revoke).toHaveBeenCalledWith("token-1"));
  });

  it("shows a controller error", () => {
    renderPanel(controller({ error: "Network down" }));

    expect(screen.getByRole("alert").textContent).toContain("Network down");
  });
});
