import { vi, type Mock } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../lib/env";

export const TEST_ENV: AppEnv = {
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "sb_publishable_test_key_1234567890",
  storageLimitBytes: 1024 * 1024 * 1024,
};

export function fakeSession(overrides: Partial<Session> = {}): Session {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "user-1",
      app_metadata: {},
      user_metadata: { full_name: "Jo Doe" },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: "jo@example.com",
    },
    ...overrides,
  } as unknown as Session;
}

export type FakeAuth = {
  getSession: Mock;
  onAuthStateChange: Mock;
  signInWithOtp: Mock;
  signInWithOAuth: Mock;
  signOut: Mock;
};

export function fakeSupabase(options: {
  session?: Session | null;
  getSession?: Mock;
} = {}) {
  const unsubscribe = vi.fn();
  const auth: FakeAuth = {
    getSession:
      options.getSession ??
      vi.fn().mockResolvedValue({
        data: { session: options.session ?? null },
        error: null,
      }),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe } },
    })),
    signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };

  return {
    client: { auth } as unknown as SupabaseClient,
    auth,
    unsubscribe,
  };
}
