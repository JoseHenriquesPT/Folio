import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders a recovery screen instead of a blank app", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const preventJsdomErrorReport = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", preventJsdomErrorReport);

    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );

      expect(
        screen.getByRole("heading", { name: "Something went wrong" })
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Reload Folio" })).toBeTruthy();
    } finally {
      window.removeEventListener("error", preventJsdomErrorReport);
    }
  });
});
