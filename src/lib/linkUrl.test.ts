import { describe, expect, it } from "vitest";
import { decideLinkChoice, normalizeHref } from "./linkUrl";

describe("normalizeHref", () => {
  it("keeps values that already carry a scheme or are relative", () => {
    expect(normalizeHref("https://example.com/a")).toBe(
      "https://example.com/a"
    );
    expect(normalizeHref("http://example.com")).toBe("http://example.com");
    expect(normalizeHref("mailto:jo@example.com")).toBe("mailto:jo@example.com");
    expect(normalizeHref("#section-2")).toBe("#section-2");
    expect(normalizeHref("/notes/abc")).toBe("/notes/abc");
  });

  it("leaves mixed-case schemes alone and prefixes bare domains", () => {
    expect(normalizeHref("example.com/page")).toBe(
      "https://example.com/page"
    );
    expect(normalizeHref("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
    expect(normalizeHref("Mailto:jo@example.com")).toBe(
      "Mailto:jo@example.com"
    );
    expect(normalizeHref("docs.example.com/guide")).toBe(
      "https://docs.example.com/guide"
    );
  });
});

describe("decideLinkChoice", () => {
  it("treats a cancelled prompt as no change", () => {
    expect(decideLinkChoice(null)).toEqual({ action: "cancel" });
  });

  it("treats blank input as removing the link", () => {
    expect(decideLinkChoice("")).toEqual({ action: "clear" });
    expect(decideLinkChoice("   ")).toEqual({ action: "clear" });
  });

  it("sets a normalized href for real input", () => {
    expect(decideLinkChoice("example.com")).toEqual({
      action: "set",
      href: "https://example.com",
    });
    expect(decideLinkChoice("  https://example.com/x  ")).toEqual({
      action: "set",
      href: "https://example.com/x",
    });
  });
});
