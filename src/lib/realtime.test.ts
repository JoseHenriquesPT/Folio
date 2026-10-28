import { describe, expect, it } from "vitest";
import {
  decideNoteChange,
  decideShareChange,
  shouldRefreshList,
} from "./realtime";

const baseNote = {
  eventType: "UPDATE" as const,
  noteId: "note-1",
  currentNoteId: "note-1",
  currentVersion: 4,
  incomingVersion: 5,
  dirty: false,
  saving: false,
  selfUserId: "user-1",
  lastEditedBy: "user-2",
};

describe("decideNoteChange", () => {
  it("ignores an event for another note", () => {
    expect(decideNoteChange({ ...baseNote, noteId: "note-2" })).toBe("ignore");
  });

  it("ignores an event at or below the current version", () => {
    expect(decideNoteChange({ ...baseNote, incomingVersion: 4 })).toBe("ignore");
    expect(decideNoteChange({ ...baseNote, incomingVersion: 3 })).toBe("ignore");
  });

  it("ignores this user's own save while it is in flight", () => {
    expect(
      decideNoteChange({
        ...baseNote,
        saving: true,
        lastEditedBy: "user-1",
      })
    ).toBe("ignore");
  });

  it("refreshes a clean note after a remote update", () => {
    expect(decideNoteChange(baseNote)).toBe("refresh");
  });

  it("warns instead of refreshing a dirty note", () => {
    expect(decideNoteChange({ ...baseNote, dirty: true })).toBe("warn");
  });

  it("warns while a save is in flight", () => {
    expect(decideNoteChange({ ...baseNote, saving: true })).toBe("warn");
  });

  it("ignores a delete for another note", () => {
    expect(
      decideNoteChange({ ...baseNote, eventType: "DELETE", noteId: "note-2" })
    ).toBe("ignore");
  });

  it("reports removal when the note disappears", () => {
    expect(decideNoteChange({ ...baseNote, eventType: "DELETE" })).toBe(
      "removed"
    );
  });
});

const baseShare = {
  eventType: "INSERT" as const,
  noteId: "note-1",
  currentNoteId: "note-1",
  sharedWith: "user-2",
  userId: "user-2",
  isOwner: false,
};

describe("decideShareChange", () => {
  it("ignores a share event on another note", () => {
    expect(decideShareChange({ ...baseShare, noteId: "note-2" })).toBe(
      "ignore"
    );
  });

  it("asks the recipient to re-check access when a share disappears", () => {
    expect(
      decideShareChange({ ...baseShare, eventType: "DELETE" })
    ).toBe("check-access");
  });

  it("re-checks access even when the delete payload has no columns", () => {
    expect(
      decideShareChange({ ...baseShare, eventType: "DELETE", sharedWith: "" })
    ).toBe("check-access");
  });

  it("reports a permission change to the recipient", () => {
    expect(decideShareChange({ ...baseShare, eventType: "UPDATE" })).toBe(
      "permission"
    );
  });

  it("tells the owner to refresh their recipient list", () => {
    expect(
      decideShareChange({ ...baseShare, userId: "user-1", isOwner: true })
    ).toBe("shares");
  });

  it("tells the owner to refresh their list when a share is deleted", () => {
    expect(
      decideShareChange({
        ...baseShare,
        eventType: "DELETE",
        sharedWith: "",
        userId: "user-1",
        isOwner: true,
      })
    ).toBe("shares");
  });

  it("ignores share rows the recipient cannot see", () => {
    expect(decideShareChange({ ...baseShare, sharedWith: "user-3" })).toBe(
      "ignore"
    );
  });
});

describe("shouldRefreshList", () => {
  it("skips this user's own note updates", () => {
    expect(shouldRefreshList("UPDATE", "user-1", "user-1")).toBe(false);
  });

  it("refreshes for remote updates and removals", () => {
    expect(shouldRefreshList("UPDATE", "user-2", "user-1")).toBe(true);
    expect(shouldRefreshList("DELETE", null, "user-1")).toBe(true);
    expect(shouldRefreshList("INSERT", null, "user-1")).toBe(true);
  });
});
