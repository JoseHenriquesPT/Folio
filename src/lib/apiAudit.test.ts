import { describe, expect, it } from "vitest";
import { auditTarget, auditToolLabel } from "./apiAudit";

describe("external audit helpers", () => {
  it("labels the external tools", () => {
    expect(auditToolLabel("create_note")).toBe("Created note");
    expect(auditToolLabel("update_note")).toBe("Updated note");
    expect(auditToolLabel("move_notes")).toBe("Moved notes");
    expect(auditToolLabel("add_tags")).toBe("Added tags");
    expect(auditToolLabel("remove_tags")).toBe("Removed tags");
    expect(auditToolLabel("create_notebook")).toBe("Created notebook");
    expect(auditToolLabel("rename_notebook")).toBe("Renamed notebook");
    expect(auditToolLabel("undo_update")).toBe("Undid a note update");
    expect(auditToolLabel("something_else")).toBe("External change");
  });

  it("prefers the summary title, then the notebook name", () => {
    expect(
      auditTarget({
        noteIds: ["note-1"],
        noteTitles: [],
        summary: { title: "Lisbon" },
      })
    ).toBe("Lisbon");
    expect(
      auditTarget({
        noteIds: [],
        noteTitles: [],
        summary: { name: "Trips" },
      })
    ).toBe("Trips");
  });

  it("falls back to note titles and counts", () => {
    expect(
      auditTarget({
        noteIds: ["note-1"],
        noteTitles: ["Lisbon"],
        summary: {},
      })
    ).toBe("Lisbon");
    expect(
      auditTarget({
        noteIds: ["note-1", "note-2"],
        noteTitles: ["Lisbon", "Porto"],
        summary: {},
      })
    ).toBe("2 notes");
    expect(
      auditTarget({
        noteIds: ["note-1"],
        noteTitles: [],
        summary: {},
      })
    ).toBe("1 note");
    expect(
      auditTarget({
        noteIds: ["note-1", "note-2"],
        noteTitles: [],
        summary: {},
      })
    ).toBe("2 notes");
    expect(
      auditTarget({
        noteIds: [],
        noteTitles: [],
        summary: {},
      })
    ).toBe("Notebook change");
  });
});
