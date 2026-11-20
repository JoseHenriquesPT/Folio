import { describe, expect, it } from "vitest";
import { notebookMenuItems } from "./notebookMenu";

describe("notebookMenuItems", () => {
  it("offers open, archive, unarchive and manage on an owned notebook", () => {
    const items = notebookMenuItems({ owner_id: "user-1" }, "user-1");

    expect(items.map((item) => item.label)).toEqual([
      "Open",
      "Archive all notes",
      "Unarchive all notes",
      "Manage notebooks…",
    ]);
    expect(items.map((item) => item.id)).toEqual([
      "open",
      "archive",
      "unarchive",
      "manage",
    ]);
  });

  it("offers nothing on a notebook shared with the viewer", () => {
    expect(notebookMenuItems({ owner_id: "user-2" }, "user-1")).toEqual([]);
  });
});
