import { describe, expect, it } from "vitest";
import {
  TOKEN_NAME_MAX,
  scopeDescription,
  scopeLabel,
  statusLabel,
  tokenExpiryDate,
  tokenPrefixLabel,
  tokenStatus,
  validateTokenName,
} from "./apiTokens";

const NOW = new Date("2026-11-12T12:00:00.000Z");

describe("external access token helpers", () => {
  it("requires a non-empty name", () => {
    expect(validateTokenName("")).toBe("Give the token a name.");
    expect(validateTokenName("   ")).toBe("Give the token a name.");
  });

  it("bounds the name length", () => {
    expect(validateTokenName("x".repeat(TOKEN_NAME_MAX + 1))).toBe(
      `Keep the name under ${TOKEN_NAME_MAX} characters.`
    );
    expect(validateTokenName("x".repeat(TOKEN_NAME_MAX))).toBeNull();
  });

  it("accepts a normal device name", () => {
    expect(validateTokenName("  Desktop  ")).toBeNull();
  });

  it("computes an expiry date from whole days", () => {
    expect(tokenExpiryDate(30, NOW)).toBe(
      new Date(NOW.getTime() + 30 * 86_400_000).toISOString()
    );
  });

  it("reports active, expired and revoked states", () => {
    expect(
      tokenStatus(
        { expiresAt: "2026-12-12T12:00:00.000Z", revokedAt: null },
        NOW
      )
    ).toBe("active");
    expect(
      tokenStatus(
        { expiresAt: NOW.toISOString(), revokedAt: null },
        NOW
      )
    ).toBe("expired");
    expect(
      tokenStatus(
        { expiresAt: "2026-12-12T12:00:00.000Z", revokedAt: NOW.toISOString() },
        NOW
      )
    ).toBe("revoked");
  });

  it("lets revocation win over expiry", () => {
    expect(
      tokenStatus(
        { expiresAt: "2026-01-01T00:00:00.000Z", revokedAt: NOW.toISOString() },
        NOW
      )
    ).toBe("revoked");
  });

  it("labels scopes and explains what they allow", () => {
    expect(scopeLabel("read")).toBe("Read only");
    expect(scopeLabel("write")).toBe("Read and write");
    expect(scopeDescription("read")).toContain("search and read");
    expect(scopeDescription("write")).toContain("create, edit, move");
  });

  it("labels statuses for people", () => {
    expect(statusLabel("active")).toBe("Active");
    expect(statusLabel("expired")).toBe("Expired");
    expect(statusLabel("revoked")).toBe("Revoked");
  });

  it("shortens the stored prefix for display", () => {
    expect(tokenPrefixLabel("folio_pat_ab12cd")).toBe("folio_pat_ab12cd…");
  });
});
