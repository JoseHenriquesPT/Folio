import { describe, expect, it } from "vitest";
import { noteMenuItems, type NoteMenuSubject } from "./noteMenu";

const OWNER = "user-1";

function note(overrides: Partial<NoteMenuSubject> = {}): NoteMenuSubject {
  return {
    owner_id: OWNER,
    pinned: false,
    archived: false,
    deleted_at: null,
    ...overrides,
  };
}

function labels(subject: NoteMenuSubject, userId = OWNER): string[] {
  return noteMenuItems(subject, userId).map((item) => item.label);
}

describe("noteMenuItems", () => {
  it("offers the everyday actions for an owned note", () => {
    expect(labels(note())).toEqual([
      "Open",
      "Pin",
      "Archive",
      "Move to notebook…",
      "Share",
      "Move to trash",
    ]);
  });

  it("swaps Pin and Archive for their opposites", () => {
    expect(labels(note({ pinned: true }))).toContain("Unpin");
    expect(labels(note({ archived: true }))).toContain("Unarchive");
    expect(labels(note({ pinned: true }))).not.toContain("Pin");
    expect(labels(note({ archived: true }))).not.toContain("Archive");
  });

  it("offers only restore and delete for a trashed note", () => {
    const items = noteMenuItems(note({ deleted_at: "2026-10-29T10:00:00Z" }), OWNER);

    expect(items.map((item) => item.label)).toEqual([
      "Open",
      "Restore",
      "Delete permanently",
    ]);
    expect(items.at(-1)?.tone).toBe("danger");
  });

  it("never offers mutations on a note shared with the user", () => {
    expect(labels(note(), "someone-else")).toEqual([]);
    expect(
      labels(note({ deleted_at: "2026-10-29T10:00:00Z" }), "someone-else")
    ).toEqual([]);
  });

  it("keeps the destructive action last", () => {
    expect(labels(note()).at(-1)).toBe("Move to trash");
  });
});
