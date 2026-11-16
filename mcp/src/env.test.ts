import { describe, expect, it } from "vitest";
import { readMcpEnv } from "./env";

const BASE = {
  FOLIO_SUPABASE_URL: "http://127.0.0.1:54321",
  FOLIO_SUPABASE_ANON_KEY: "sb_publishable_1234567890",
  FOLIO_TOKEN: "folio_pat_test_token",
};

describe("readMcpEnv", () => {
  it("reads a local development configuration", () => {
    expect(readMcpEnv(BASE)).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      anonKey: "sb_publishable_1234567890",
      token: "folio_pat_test_token",
    });
  });

  it("accepts https and trims whitespace", () => {
    expect(
      readMcpEnv({
        FOLIO_SUPABASE_URL: "  https://example.supabase.co/  ",
        FOLIO_SUPABASE_ANON_KEY: "  sb_publishable_1234567890  ",
        FOLIO_TOKEN: "  folio_pat_test_token  ",
      })
    ).toEqual({
      supabaseUrl: "https://example.supabase.co",
      anonKey: "sb_publishable_1234567890",
      token: "folio_pat_test_token",
    });
  });

  it("rejects missing variables by name", () => {
    expect(() => readMcpEnv({})).toThrow(/FOLIO_SUPABASE_URL/);
    expect(() =>
      readMcpEnv({ ...BASE, FOLIO_SUPABASE_ANON_KEY: "" })
    ).toThrow(/FOLIO_SUPABASE_ANON_KEY/);
    expect(() => readMcpEnv({ ...BASE, FOLIO_TOKEN: "" })).toThrow(
      /FOLIO_TOKEN/
    );
  });

  it("rejects plain http outside localhost", () => {
    expect(() =>
      readMcpEnv({ ...BASE, FOLIO_SUPABASE_URL: "http://example.com" })
    ).toThrow(/must use https/);
  });

  it("rejects credentials in the URL", () => {
    expect(() =>
      readMcpEnv({
        ...BASE,
        FOLIO_SUPABASE_URL: "https://user:pass@example.supabase.co",
      })
    ).toThrow(/must not contain credentials/);
  });

  it("rejects an invalid URL", () => {
    expect(() =>
      readMcpEnv({ ...BASE, FOLIO_SUPABASE_URL: "not a url" })
    ).toThrow(/not a valid URL/);
  });

  it("rejects a short anon key", () => {
    expect(() =>
      readMcpEnv({ ...BASE, FOLIO_SUPABASE_ANON_KEY: "short" })
    ).toThrow(/looks too short/);
  });

  it("rejects a token without the Folio prefix", () => {
    expect(() =>
      readMcpEnv({ ...BASE, FOLIO_TOKEN: "sk_test" })
    ).toThrow(/folio_pat_/);
  });
});
