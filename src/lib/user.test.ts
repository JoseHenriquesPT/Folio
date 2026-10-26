import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { displayName, initials } from "./user";

function sessionWith(metadata: Record<string, unknown>, email: string | null = "jo@example.com") {
  return {
    user: { user_metadata: metadata, email },
  } as unknown as Session;
}

describe("displayName", () => {
  it("prefers full_name", () => {
    expect(displayName(sessionWith({ full_name: "Jo Doe", name: "Jo" }))).toBe("Jo Doe");
  });

  it("falls back to name, then email", () => {
    expect(displayName(sessionWith({ name: "Jo" }))).toBe("Jo");
    expect(displayName(sessionWith({}))).toBe("jo@example.com");
  });

  it("uses a readable fallback without an email", () => {
    expect(displayName(sessionWith({}, null))).toBe("Your account");
  });
});

describe("initials", () => {
  it("uses the first letters of the first and last names", () => {
    expect(initials("Jo Doe")).toBe("JD");
    expect(initials("Jo Ana Maria Doe")).toBe("JD");
  });

  it("handles a single name", () => {
    expect(initials("Jo")).toBe("JO");
  });

  it("handles an empty name", () => {
    expect(initials("   ")).toBe("?");
  });
});
