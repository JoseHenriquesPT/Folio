import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "../test/fakeDb";
import { useApiTokens } from "./useApiTokens";

const TOKEN_ROW = {
  id: "token-1",
  name: "Desktop",
  prefix: "folio_pat_ab12cd",
  scope: "read" as const,
  created_at: "2026-11-12T12:00:00.000Z",
  last_used_at: null,
  expires_at: "2027-02-10T12:00:00.000Z",
  revoked_at: null,
  calls_today: 0,
};

function setup(db: FakeDb) {
  const toast = { push: vi.fn() };
  const hook = renderHook(() =>
    useApiTokens({ client: db.client, toast })
  );
  return { hook, toast };
}

describe("useApiTokens", () => {
  it("loads the external-access gate and the token list", async () => {
    const db = createFakeDb();
    db.queueRpc("can_manage_api_tokens", { data: true });
    db.queueRpc("list_api_tokens", { data: [TOKEN_ROW] });

    const { hook } = setup(db);

    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.canManage).toBe(true);
    expect(hook.result.current.tokens).toHaveLength(1);
    expect(hook.result.current.tokens[0].name).toBe("Desktop");
  });

  it("hides external access when the gate reports false", async () => {
    const db = createFakeDb();
    db.queueRpc("can_manage_api_tokens", { data: false });

    const { hook } = setup(db);

    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.canManage).toBe(false);
    expect(hook.result.current.tokens).toEqual([]);
    expect(db.pendingCalls()).toEqual([]);
  });

  it("creates a token, exposes it once and refreshes the list", async () => {
    const db = createFakeDb();
    db.queueRpc("can_manage_api_tokens", { data: true });
    db.queueRpc("list_api_tokens", { data: [] });
    const { hook, toast } = setup(db);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    db.queueRpc("create_api_token", {
      data: [
        {
          id: "token-2",
          token: "folio_pat_new",
          prefix: "folio_pat_new",
          scope: "read",
          expires_at: "2027-02-10T12:00:00.000Z",
        },
      ],
    });
    db.queueRpc("list_api_tokens", { data: [TOKEN_ROW] });

    let created = false;
    await act(async () => {
      created = await hook.result.current.create({
        name: "Laptop",
        scope: "read",
        expiresAt: "2027-02-10T12:00:00.000Z",
      });
    });

    expect(created).toBe(true);
    expect(hook.result.current.created).toMatchObject({
      token: "folio_pat_new",
      name: "Laptop",
    });
    expect(hook.result.current.tokens).toHaveLength(1);
    expect(toast.push).toHaveBeenCalledWith(
      "Access token created.",
      "success"
    );

    act(() => hook.result.current.dismissCreated());
    expect(hook.result.current.created).toBeNull();
  });

  it("revokes a token and refreshes the list", async () => {
    const db = createFakeDb();
    db.queueRpc("can_manage_api_tokens", { data: true });
    db.queueRpc("list_api_tokens", { data: [TOKEN_ROW] });
    const { hook, toast } = setup(db);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    db.queueRpc("revoke_api_token", { data: true });
    db.queueRpc("list_api_tokens", {
      data: [{ ...TOKEN_ROW, revoked_at: "2026-11-12T13:00:00.000Z" }],
    });

    let revoked = false;
    await act(async () => {
      revoked = await hook.result.current.revoke("token-1");
    });

    expect(revoked).toBe(true);
    expect(hook.result.current.tokens[0].revokedAt).toBe(
      "2026-11-12T13:00:00.000Z"
    );
    expect(toast.push).toHaveBeenCalledWith(
      "Access token revoked.",
      "success"
    );
  });

  it("keeps the revoked state when the refresh fails", async () => {
    const db = createFakeDb();
    db.queueRpc("can_manage_api_tokens", { data: true });
    db.queueRpc("list_api_tokens", { data: [TOKEN_ROW] });
    const { hook } = setup(db);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    db.queueRpc("revoke_api_token", { data: true });
    db.queueRpc("list_api_tokens", { error: { message: "offline" } });

    await act(async () => {
      expect(await hook.result.current.revoke("token-1")).toBe(true);
    });

    expect(hook.result.current.tokens[0].revokedAt).not.toBeNull();
    expect(hook.result.current.error).toBeNull();
  });

  it("reports a refused revoke", async () => {
    const db = createFakeDb();
    db.queueRpc("can_manage_api_tokens", { data: true });
    db.queueRpc("list_api_tokens", { data: [TOKEN_ROW] });
    const { hook, toast } = setup(db);
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    db.queueRpc("revoke_api_token", { data: false });

    let revoked = true;
    await act(async () => {
      revoked = await hook.result.current.revoke("token-1");
    });

    expect(revoked).toBe(false);
    expect(hook.result.current.error).toBe("The token could not be revoked.");
    expect(toast.push).toHaveBeenCalledWith(
      "The token could not be revoked.",
      "error"
    );
  });

  it("reports a load failure without exposing the card", async () => {
    const db = createFakeDb();
    db.queueRpc("can_manage_api_tokens", { error: { message: "offline" } });

    const { hook } = setup(db);

    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.error).toBe("offline");
    expect(hook.result.current.canManage).toBeNull();
  });
});
