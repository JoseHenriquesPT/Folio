import { describe, expect, it } from "vitest";
import { readEnv } from "./env";

const key = "sb_publishable_abcdefghijklmnopqrstuvwxyz";

describe("readEnv", () => {
  it("accepts an https Supabase URL and key", () => {
    const result = readEnv({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.supabaseUrl).toBe("https://example.supabase.co");
      expect(result.env.supabaseKey).toBe(key);
    }
  });

  it("accepts a localhost http URL for development", () => {
    const result = readEnv({
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.supabaseUrl).toBe("http://127.0.0.1:54321");
    }
  });

  it("rejects http on a non-local host", () => {
    const result = readEnv({
      VITE_SUPABASE_URL: "http://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join(" ")).toContain("https");
    }
  });

  it("reports missing values", () => {
    const result = readEnv({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContain("VITE_SUPABASE_URL is missing.");
      expect(result.problems).toContain("VITE_SUPABASE_PUBLISHABLE_KEY is missing.");
    }
  });

  it("rejects an invalid URL", () => {
    const result = readEnv({
      VITE_SUPABASE_URL: "not a url",
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join(" ")).toContain("not a valid URL");
    }
  });

  it("rejects a short key", () => {
    const result = readEnv({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "short",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join(" ")).toContain("too short");
    }
  });

  it("rejects credentials embedded in the URL", () => {
    const result = readEnv({
      VITE_SUPABASE_URL: "https://user:pass@example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join(" ")).toContain("credentials");
    }
  });
});
