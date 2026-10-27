import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { SupabaseProvider } from "../db/SupabaseProvider";
import { fakeSession, fakeSupabase, TEST_ENV } from "../test/fakeSupabase";
import AuthGate from "./AuthGate";

function renderGate(
  client: ReturnType<typeof fakeSupabase>["client"],
  children = <p>Notes workspace</p>
) {
  return render(
    <SupabaseProvider client={client} env={TEST_ENV}>
      <AuthGate>{children}</AuthGate>
    </SupabaseProvider>
  );
}

describe("AuthGate", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ external: { google: false } }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading without leaking the app shell", () => {
    const { client } = fakeSupabase({
      getSession: vi.fn(() => new Promise(() => {})),
    });
    renderGate(client);

    expect(screen.getByRole("status").textContent).toContain("Loading Folio");
    expect(screen.queryByText("Notes workspace")).toBeNull();
  });

  it("shows sign-in when there is no session", async () => {
    const { client } = fakeSupabase({ session: null });
    renderGate(client);

    await screen.findByRole("heading", { name: "Sign in to Folio" });
    expect(screen.queryByText("Notes workspace")).toBeNull();
  });

  it("renders the app for a signed-in session", async () => {
    const session = fakeSession();
    const { client } = fakeSupabase({ session });
    renderGate(client);

    await screen.findByText("Notes workspace");
    expect(screen.queryByRole("heading", { name: "Sign in to Folio" })).toBeNull();
  });

  it("clears auth params from the URL after resolving a session", async () => {
    window.history.replaceState({}, "", "/?code=test-code");
    const { client } = fakeSupabase({ session: fakeSession() });
    renderGate(client);

    await screen.findByText("Notes workspace");
    expect(window.location.search).toBe("");

    window.history.replaceState({}, "", "/");
  });

  it("switches from sign-in to the app when auth changes", async () => {
    let listener: ((event: string, session: Session | null) => void) | null = null;
    const { client, auth } = fakeSupabase({ session: null });
    auth.onAuthStateChange.mockImplementation(
      (callback: (event: string, session: Session | null) => void) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }
    );

    renderGate(client);
    await screen.findByRole("heading", { name: "Sign in to Folio" });

    act(() => {
      listener?.("SIGNED_IN", fakeSession());
    });

    await screen.findByText("Notes workspace");
  });

  it("unsubscribes from auth changes on unmount", async () => {
    const { client, unsubscribe } = fakeSupabase({ session: null });
    const view = renderGate(client);

    await screen.findByRole("heading", { name: "Sign in to Folio" });
    view.unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
