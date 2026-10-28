import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/env";
import { fetchAuthProviders } from "./providers";

const env: AppEnv = {
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "sb_publishable_test_key_1234567890",
  storageLimitBytes: 1024 * 1024 * 1024,
};

describe("fetchAuthProviders", () => {
  it("reads the Google provider flag", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ external: { google: true } }),
    });

    await expect(fetchAuthProviders(env, fetchImpl)).resolves.toEqual({
      google: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/settings",
      { headers: { apikey: env.supabaseKey } }
    );
  });

  it("reports a disabled provider", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ external: { google: false } }),
    });

    await expect(fetchAuthProviders(env, fetchImpl)).resolves.toEqual({
      google: false,
    });
  });

  it("throws when settings cannot be loaded", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });

    await expect(fetchAuthProviders(env, fetchImpl)).rejects.toThrow(
      "Could not load sign-in providers."
    );
  });
});
