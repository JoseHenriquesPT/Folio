import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseProvider } from "../db/SupabaseProvider";
import { fakeSupabase, TEST_ENV } from "../test/fakeSupabase";
import SignIn from "./SignIn";

function stubGoogleEnabled(enabled: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ external: { google: enabled } }),
    })
  );
}

function renderSignIn(client: ReturnType<typeof fakeSupabase>["client"]) {
  return render(
    <SupabaseProvider client={client} env={TEST_ENV}>
      <SignIn />
    </SupabaseProvider>
  );
}

describe("SignIn", () => {
  beforeEach(() => {
    stubGoogleEnabled(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a magic link to the entered email", async () => {
    const user = userEvent.setup();
    const { client, auth } = fakeSupabase();
    renderSignIn(client);

    await user.type(screen.getByLabelText("Email"), "jo@example.com");
    await user.click(screen.getByRole("button", { name: "Send magic link" }));

    await waitFor(() => {
      expect(auth.signInWithOtp).toHaveBeenCalledWith({
        email: "jo@example.com",
        options: { emailRedirectTo: window.location.origin },
      });
    });
    await screen.findByText("Check your inbox");
    expect(screen.getByText("jo@example.com")).toBeTruthy();
  });

  it("hides Google when the project has it disabled", async () => {
    const { client } = fakeSupabase();
    renderSignIn(client);

    await screen.findByLabelText("Email");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });

  it("starts Google sign-in when the provider is enabled", async () => {
    stubGoogleEnabled(true);
    const user = userEvent.setup();
    const { client, auth } = fakeSupabase();
    renderSignIn(client);

    const button = await screen.findByRole("button", {
      name: "Continue with Google",
    });
    await user.click(button);

    await waitFor(() => {
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
    });
  });

  it("shows a clear error when Google sign-in fails", async () => {
    stubGoogleEnabled(true);
    const user = userEvent.setup();
    const { client, auth } = fakeSupabase();
    auth.signInWithOAuth.mockResolvedValue({
      data: {},
      error: new Error("Provider is not enabled"),
    });
    renderSignIn(client);

    const button = await screen.findByRole("button", {
      name: "Continue with Google",
    });
    await user.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Google sign-in is not configured");
  });

  it("lets the user retry with another email", async () => {
    const user = userEvent.setup();
    const { client } = fakeSupabase();
    renderSignIn(client);

    await user.type(screen.getByLabelText("Email"), "jo@example.com");
    await user.click(screen.getByRole("button", { name: "Send magic link" }));
    await screen.findByText("Check your inbox");

    await user.click(screen.getByRole("button", { name: "Use a different email" }));

    expect(screen.getByLabelText("Email")).toBeTruthy();
  });
});
