import { describe, expect, it } from "vitest";
import { createFakeDb } from "../test/fakeDb";
import {
  canManageApiTokens,
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "./apiTokens";

const ROW = {
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

describe("external access data layer", () => {
  it("reads the owner gate", async () => {
    const db = createFakeDb();
    db.queueRpc("can_manage_api_tokens", { data: true });

    await expect(canManageApiTokens(db.client)).resolves.toBe(true);
    expect(db.rpc).toHaveBeenCalledWith("can_manage_api_tokens");
  });

  it("returns false when the account is not the owner", async () => {
    const db = createFakeDb();
    db.queueRpc("can_manage_api_tokens", { data: false });

    await expect(canManageApiTokens(db.client)).resolves.toBe(false);
  });

  it("lists tokens and maps them to camelCase", async () => {
    const db = createFakeDb();
    db.queueRpc("list_api_tokens", { data: [ROW] });

    await expect(listApiTokens(db.client)).resolves.toEqual([
      {
        id: "token-1",
        name: "Desktop",
        prefix: "folio_pat_ab12cd",
        scope: "read",
        createdAt: "2026-11-12T12:00:00.000Z",
        lastUsedAt: null,
        expiresAt: "2027-02-10T12:00:00.000Z",
        revokedAt: null,
        callsToday: 0,
      },
    ]);
    expect(db.rpc).toHaveBeenCalledWith("list_api_tokens");
  });

  it("creates a token with a trimmed name and the raw value", async () => {
    const db = createFakeDb();
    db.queueRpc("create_api_token", {
      data: [
        {
          id: "token-2",
          token: "folio_pat_abc123",
          prefix: "folio_pat_abc123",
          scope: "write",
          expires_at: "2027-02-10T12:00:00.000Z",
        },
      ],
    });

    await expect(
      createApiToken(db.client, {
        name: "  Laptop  ",
        scope: "write",
        expiresAt: "2027-02-10T12:00:00.000Z",
      })
    ).resolves.toEqual({
      id: "token-2",
      token: "folio_pat_abc123",
      name: "Laptop",
      prefix: "folio_pat_abc123",
      scope: "write",
      expiresAt: "2027-02-10T12:00:00.000Z",
    });
    expect(db.rpc).toHaveBeenCalledWith("create_api_token", {
      p_name: "Laptop",
      p_scope: "write",
      p_expires_at: "2027-02-10T12:00:00.000Z",
    });
  });

  it("throws when the creator returns no token", async () => {
    const db = createFakeDb();
    db.queueRpc("create_api_token", { data: [] });

    await expect(
      createApiToken(db.client, {
        name: "Laptop",
        scope: "read",
        expiresAt: "2027-02-10T12:00:00.000Z",
      })
    ).rejects.toMatchObject({ message: "The token could not be created." });
  });

  it("revokes a token", async () => {
    const db = createFakeDb();
    db.queueRpc("revoke_api_token", { data: true });

    await expect(revokeApiToken(db.client, "token-1")).resolves.toBe(true);
    expect(db.rpc).toHaveBeenCalledWith("revoke_api_token", {
      p_id: "token-1",
    });
  });

  it("passes through a refused revoke", async () => {
    const db = createFakeDb();
    db.queueRpc("revoke_api_token", { data: false });

    await expect(revokeApiToken(db.client, "token-1")).resolves.toBe(false);
  });

  it("throws database errors", async () => {
    const db = createFakeDb();
    db.queueRpc("list_api_tokens", { error: { message: "boom" } });

    await expect(listApiTokens(db.client)).rejects.toMatchObject({
      message: "boom",
    });
  });
});
