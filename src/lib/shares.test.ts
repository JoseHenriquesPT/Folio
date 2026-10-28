import { describe, expect, it } from "vitest";
import {
  canEditNote,
  normalizeEmail,
  ownerShareBadge,
  permissionLabel,
  reduceShares,
  shareRole,
  validateShareTarget,
  type ShareRecipient,
} from "./shares";

function recipient(overrides: Partial<ShareRecipient> = {}): ShareRecipient {
  return {
    shareId: "share-1",
    userId: "user-2",
    displayName: "Rui",
    permission: "read",
    ...overrides,
  };
}

describe("share recipient reducer", () => {
  it("loads the recipient list", () => {
    const next = reduceShares([], {
      type: "load",
      recipients: [recipient(), recipient({ shareId: "share-2", userId: "user-3" })],
    });

    expect(next).toHaveLength(2);
    expect(next[1].userId).toBe("user-3");
  });

  it("adds a recipient", () => {
    const next = reduceShares([], { type: "add", recipient: recipient() });
    expect(next).toEqual([recipient()]);
  });

  it("updates an existing recipient instead of duplicating them", () => {
    const next = reduceShares([recipient()], {
      type: "add",
      recipient: recipient({ permission: "edit" }),
    });

    expect(next).toEqual([recipient({ permission: "edit" })]);
  });

  it("changes a permission by share id", () => {
    const next = reduceShares([recipient()], {
      type: "update",
      shareId: "share-1",
      permission: "edit",
    });

    expect(next).toEqual([recipient({ permission: "edit" })]);
  });

  it("revokes a recipient by share id", () => {
    const next = reduceShares([recipient(), recipient({ shareId: "share-2" })], {
      type: "revoke",
      shareId: "share-1",
    });

    expect(next).toEqual([recipient({ shareId: "share-2" })]);
  });
});

describe("permission labels", () => {
  it("describes read-only and editable access", () => {
    expect(permissionLabel("read")).toBe("Read only");
    expect(permissionLabel("edit")).toBe("Can edit");
    expect(permissionLabel(null)).toBe("No access");
  });

  it("summarises owner sharing", () => {
    expect(ownerShareBadge(0)).toBe("");
    expect(ownerShareBadge(1)).toBe("Shared");
    expect(ownerShareBadge(3)).toBe("Shared · 3");
  });
});

describe("share roles", () => {
  it("detects the owner, editor, reader, and stranger", () => {
    expect(shareRole("owner", "owner", null)).toBe("owner");
    expect(shareRole("owner", "user-2", "edit")).toBe("editor");
    expect(shareRole("owner", "user-2", "read")).toBe("reader");
    expect(shareRole("owner", "user-3", null)).toBe("stranger");
  });

  it("only lets owners and editors change a note", () => {
    expect(canEditNote("owner")).toBe(true);
    expect(canEditNote("editor")).toBe(true);
    expect(canEditNote("reader")).toBe(false);
    expect(canEditNote("stranger")).toBe(false);
  });
});

describe("share target validation", () => {
  const base = {
    email: "rui@example.com",
    targetId: "user-2",
    ownerId: "user-1",
    currentUserId: "user-1",
  };

  it("requires an email address", () => {
    expect(validateShareTarget({ ...base, email: "  " })).toBe(
      "Enter an email address."
    );
  });

  it("requires the account to exist", () => {
    expect(validateShareTarget({ ...base, targetId: null })).toBe(
      "No account uses that email."
    );
  });

  it("blocks sharing with the owner", () => {
    expect(validateShareTarget({ ...base, targetId: "user-1" })).toBe(
      "You already own this note."
    );
  });

  it("blocks sharing with yourself", () => {
    expect(
      validateShareTarget({
        ...base,
        targetId: "user-2",
        ownerId: "user-9",
        currentUserId: "user-2",
      })
    ).toBe("You cannot share a note with yourself.");
  });

  it("accepts a valid recipient", () => {
    expect(validateShareTarget(base)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases the exact lookup input", () => {
    expect(normalizeEmail("  Rui@Example.COM ")).toBe("rui@example.com");
  });
});
