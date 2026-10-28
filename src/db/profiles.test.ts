import { describe, expect, it } from "vitest";
import { createFakeDb, methodCalls } from "../test/fakeDb";
import {
  findProfileByEmail,
  getProfile,
  getPublicProfile,
  listProfilesByIds,
  listPublicProfiles,
  updateDisplayName,
} from "./profiles";
import type { ProfileRow, PublicProfileRow } from "./database.types";

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-1",
    email: "ana@example.com",
    display_name: "Ana",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("profiles data layer", () => {
  it("reads the signed-in user's profile", async () => {
    const db = createFakeDb();
    const query = db.queue("profiles", { data: profile() });

    await expect(getProfile(db.client, "user-1")).resolves.toEqual(profile());
    expect(db.from).toHaveBeenCalledWith("profiles");
    expect(methodCalls(query, "select")).toEqual([["*"]]);
    expect(methodCalls(query, "eq")).toEqual([["id", "user-1"]]);
    expect(query.calls).toContainEqual({ method: "maybeSingle", args: [] });
    expect(db.pendingCalls()).toEqual([]);
  });

  it("returns null when the profile does not exist", async () => {
    const db = createFakeDb();
    db.queue("profiles", { data: null });

    await expect(getProfile(db.client, "user-1")).resolves.toBeNull();
  });

  it("updates only the display name", async () => {
    const db = createFakeDb();
    const query = db.queue("profiles", {
      data: profile({ display_name: "Ana Maria" }),
    });

    await expect(updateDisplayName(db.client, "user-1", "Ana Maria")).resolves.toEqual(
      profile({ display_name: "Ana Maria" })
    );
    expect(methodCalls(query, "update")).toEqual([
      [{ display_name: "Ana Maria" }],
    ]);
    expect(methodCalls(query, "eq")).toEqual([["id", "user-1"]]);
  });

  it("looks up an exact email through the RPC", async () => {
    const db = createFakeDb();
    const result: PublicProfileRow = { id: "user-2", display_name: "Rui" };
    db.queueRpc("find_profile_by_email", { data: [result] });

    await expect(findProfileByEmail(db.client, "rui@example.com")).resolves.toEqual(
      result
    );
    expect(db.rpc).toHaveBeenCalledWith("find_profile_by_email", {
      candidate_email: "rui@example.com",
    });
  });

  it("returns null when the email lookup has no rows", async () => {
    const db = createFakeDb();
    db.queueRpc("find_profile_by_email", { data: [] });

    await expect(findProfileByEmail(db.client, "nobody@example.com")).resolves.toBeNull();
  });

  it("lists public profiles ordered by display name", async () => {
    const db = createFakeDb();
    const query = db.queue("public_profiles", {
      data: [{ id: "user-2", display_name: "Rui" }],
    });

    await expect(listPublicProfiles(db.client)).resolves.toEqual([
      { id: "user-2", display_name: "Rui" },
    ]);
    expect(methodCalls(query, "order")).toEqual([
      ["display_name", { ascending: true }],
    ]);
  });

  it("reads one public profile for a share label", async () => {
    const db = createFakeDb();
    const query = db.queue("public_profiles", {
      data: { id: "user-1", display_name: "Ana" },
    });

    await expect(getPublicProfile(db.client, "user-1")).resolves.toEqual({
      id: "user-1",
      display_name: "Ana",
    });
    expect(methodCalls(query, "eq")).toEqual([["id", "user-1"]]);
  });

  it("returns null when a public profile is missing", async () => {
    const db = createFakeDb();
    db.queue("public_profiles", { data: null });

    await expect(getPublicProfile(db.client, "user-9")).resolves.toBeNull();
  });

  it("loads public profiles for a known set of ids", async () => {
    const db = createFakeDb();
    const query = db.queue("public_profiles", {
      data: [
        { id: "user-2", display_name: "Rui" },
        { id: "user-3", display_name: "Ines" },
      ],
    });

    await expect(
      listProfilesByIds(db.client, ["user-2", "user-3"])
    ).resolves.toEqual([
      { id: "user-2", display_name: "Rui" },
      { id: "user-3", display_name: "Ines" },
    ]);
    expect(methodCalls(query, "in")).toEqual([["id", ["user-2", "user-3"]]]);
  });

  it("skips the query when no profile ids were supplied", async () => {
    const db = createFakeDb();

    await expect(listProfilesByIds(db.client, [])).resolves.toEqual([]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("throws database errors", async () => {
    const db = createFakeDb();
    db.queue("profiles", { error: { message: "boom" } });

    await expect(getProfile(db.client, "user-1")).rejects.toMatchObject({
      message: "boom",
    });
  });
});
