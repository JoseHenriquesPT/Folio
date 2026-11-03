import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConflictReview from "./ConflictReview";

const local = {
  title: "Mine",
  bodyHtml: "<p>Local <strong>draft</strong></p><script>alert(1)</script>",
};
const server = {
  title: "Theirs",
  bodyHtml: "<p>Server copy</p>",
};

function setup(overrides: Partial<Parameters<typeof ConflictReview>[0]> = {}) {
  const props = {
    open: true,
    loading: false,
    error: null,
    busy: false,
    local,
    server,
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onKeepMine: vi.fn(),
    onUseServer: vi.fn(),
    ...overrides,
  };
  render(<ConflictReview {...props} />);
  return props;
}

describe("ConflictReview", () => {
  it("stays out of the page while closed", () => {
    const { container } = render(
      <ConflictReview
        open={false}
        loading={false}
        error={null}
        busy={false}
        local={local}
        server={null}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onKeepMine={vi.fn()}
        onUseServer={vi.fn()}
      />
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows both versions side by side once loaded", () => {
    setup();

    expect(screen.getByRole("region", { name: "Your version" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Server version" })).toBeTruthy();
    expect(screen.getByText("Local", { exact: false })).toBeTruthy();
    expect(screen.getByText("Server copy")).toBeTruthy();
    expect(screen.queryByText("alert(1)")).toBeNull();
  });

  it("shows the loading state while the server copy is fetched", () => {
    setup({ loading: true, server: null });
    expect(screen.getByText("Loading the server version…")).toBeTruthy();
    const useServer = screen.getByRole("button", {
      name: "Use server version",
    }) as HTMLButtonElement;
    expect(useServer.disabled).toBe(true);
  });

  it("lets a failed fetch be retried", () => {
    const props = setup({
      server: null,
      error: "The server copy could not be loaded.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  it("reports the two resolutions", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Use server version" })
    );

    expect(props.onKeepMine).toHaveBeenCalledOnce();
    expect(props.onUseServer).toHaveBeenCalledOnce();
  });

  it("closes without changing either version", () => {
    const props = setup();

    fireEvent.click(
      screen.getByRole("button", { name: "Close conflict review" })
    );
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});
