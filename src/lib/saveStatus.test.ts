import { describe, expect, it } from "vitest";
import { saveStatusView } from "./saveStatus";

describe("saveStatusView", () => {
  it("shows nothing for an untouched new note", () => {
    expect(saveStatusView({ status: "idle", hasNote: false })).toEqual({
      tone: "idle",
      label: "",
    });
  });

  it("treats an untouched saved note as saved", () => {
    expect(saveStatusView({ status: "idle", hasNote: true })).toEqual({
      tone: "saved",
      label: "Saved",
    });
  });

  it.each([
    ["dirty", "Unsaved changes"],
    ["saving", "Saving"],
    ["saved", "Saved"],
    ["error", "Save failed"],
    ["conflict", "Conflict"],
  ] as const)("maps %s to a short label", (status, label) => {
    expect(saveStatusView({ status, hasNote: true })).toEqual({
      tone: status,
      label,
    });
  });
});
