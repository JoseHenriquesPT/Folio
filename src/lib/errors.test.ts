import { describe, expect, it } from "vitest";
import { abortError, isAbortError, toMessage } from "./errors";

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

describe("abort helpers", () => {
  it("builds a DOMException named AbortError", () => {
    const error = abortError();

    expect(error.name).toBe("AbortError");
    expect(isAbortError(error)).toBe(true);
  });

  it("recognises abort-shaped errors from other realms", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new Error("AbortError"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
