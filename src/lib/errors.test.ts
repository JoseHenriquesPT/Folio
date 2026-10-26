import { describe, expect, it } from "vitest";
import { toMessage } from "./errors";

describe("toMessage", () => {
  it("keeps normal error messages", () => {
    expect(toMessage(new Error("Network unavailable"))).toBe("Network unavailable");
  });

  it("explains a disabled Google provider", () => {
    expect(toMessage(new Error("Provider is not enabled"))).toBe(
      "Google sign-in is not configured for this project yet."
    );
  });

  it("explains rate limiting", () => {
    expect(toMessage({ message: "Too many requests" })).toBe(
      "Too many attempts. Wait a moment and try again."
    );
  });

  it("falls back for unknown values", () => {
    expect(toMessage(null)).toBe("Something went wrong. Please try again.");
  });
});
