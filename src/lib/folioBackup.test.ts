import { describe, expect, it } from "vitest";
import { planFolioBackupImport } from "./folioBackup";
import {
  BACKUP_ATTACHMENT_IMAGE,
  BACKUP_ATTACHMENT_RULES,
  BACKUP_NOTEBOOK_IDEAS,
  BACKUP_NOTEBOOK_WEB,
  BACKUP_NOTE_ARCHIVED,
  BACKUP_NOTE_CARD_GAMES,
  BACKUP_NOTE_LOOSE,
  folioBackupFixture,
} from "./__fixtures__/folioBackup";

function parse(overrides: (backup: ReturnType<typeof folioBackupFixture>) => void = () => {}) {
  const backup = folioBackupFixture();
  overrides(backup);
  return planFolioBackupImport(JSON.stringify(backup));
}

describe("planFolioBackupImport", () => {
  it("plans notebooks, notes, tags, timestamps, and archive state", () => {
    const plan = parse();

    expect(plan.source).toBe("folio-json");
    expect(plan.rootLabel).toBe("Folio");
    expect(plan.notebooks).toEqual([
      { id: BACKUP_NOTEBOOK_IDEAS, title: "Ideas", parentId: null },
      { id: BACKUP_NOTEBOOK_WEB, title: "Web", parentId: BACKUP_NOTEBOOK_IDEAS },
    ]);
    expect(plan.notes).toHaveLength(3);
    expect(plan.notes[0]).toMatchObject({
      id: BACKUP_NOTE_CARD_GAMES,
      title: "Card Games",
      notebookId: BACKUP_NOTEBOOK_WEB,
      tags: ["Games", "fun"],
      archived: false,
      createdAt: "2026-09-07T18:59:22.990Z",
      updatedAt: "2026-09-07T19:00:16.462Z",
    });
    expect(plan.notes[1]).toMatchObject({
      id: BACKUP_NOTE_ARCHIVED,
      notebookId: BACKUP_NOTEBOOK_IDEAS,
      archived: true,
    });
    expect(plan.notes[2]).toMatchObject({
      id: BACKUP_NOTE_LOOSE,
      notebookId: null,
    });
    expect(plan.counts).toEqual({
      notes: 3,
      notebooks: 2,
      attachments: 2,
      tags: 3,
      skipped: 0,
      linksRewritten: 0,
    });
  });

  it("sanitises stored HTML but keeps attachment refs", () => {
    const plan = parse();
    const body = plan.notes[0].bodyHtml;

    expect(body).toContain(`<img src="attachment:${BACKUP_ATTACHMENT_IMAGE}"`);
    expect(body).toContain("<strong>world</strong>");
    expect(body).not.toContain("<script");
    expect(body).not.toContain("onerror");
  });

  it("lists every attachment for a note, not only the inline images", () => {
    const plan = parse();

    expect(plan.notes[0].attachmentIds).toEqual([
      BACKUP_ATTACHMENT_IMAGE,
      BACKUP_ATTACHMENT_RULES,
    ]);
    expect(plan.attachments).toEqual([
      {
        id: BACKUP_ATTACHMENT_IMAGE,
        sourceNoteId: BACKUP_NOTE_CARD_GAMES,
        fileName: "table.png",
        mimeType: "image/png",
        sizeBytes: 3,
      },
      {
        id: BACKUP_ATTACHMENT_RULES,
        sourceNoteId: BACKUP_NOTE_CARD_GAMES,
        fileName: "rules.txt",
        mimeType: "text/plain",
        sizeBytes: 12,
      },
    ]);
    expect(plan.attachments[0].bytes).toBeUndefined();
  });

  it("falls back to note-level attachments when the flat list is absent", () => {
    const plan = parse((backup) => {
      backup.attachments = [];
    });

    expect(plan.attachments.map((item) => item.id)).toEqual([
      BACKUP_ATTACHMENT_IMAGE,
      BACKUP_ATTACHMENT_RULES,
    ]);
    expect(plan.counts.attachments).toBe(2);
  });

  it("warns that the JSON file has no attachment bytes", () => {
    const plan = parse();

    expect(plan.warnings).toContain(
      "The JSON backup lists 2 attachments but does not contain the files. Folio will try to re-fetch them from your storage during import."
    );
  });

  it("rebuilds a notebook path when a note points at a missing notebook", () => {
    const plan = parse((backup) => {
      const loose = backup.notes[2];
      loose.notebookId = "missing-notebook";
      loose.notebookPath = ["Projects", "Web"];
    });

    const projects = plan.notebooks.find((notebook) => notebook.title === "Projects");
    const web = plan.notebooks.find(
      (notebook) => notebook.title === "Web" && notebook.parentId === projects?.id
    );

    expect(projects).toBeTruthy();
    expect(web).toBeTruthy();
    expect(plan.notes[2].notebookId).toBe(web?.id);
    expect(plan.counts.notebooks).toBe(4);
  });

  it("warns about inline refs that are not in the attachment list", () => {
    const plan = parse((backup) => {
      backup.notes[2].bodyHtml =
        '<p><img src="attachment:99999999-9999-4999-8999-999999999999"></p>';
    });

    expect(plan.warnings).toContain(
      "Some inline files were not listed in the backup and will be removed."
    );
  });

  it("skips a malformed note and keeps the rest", () => {
    const plan = parse((backup) => {
      (backup.notes as unknown[]).push(null);
    });

    expect(plan.notes).toHaveLength(3);
    expect(plan.skipped).toEqual([
      { path: "note:4", reason: "Note entry is incomplete" },
    ]);
    expect(plan.counts.skipped).toBe(1);
  });

  it("warns when the backup has no notes", () => {
    const plan = parse((backup) => {
      backup.notes = [];
      backup.attachments = [];
    });

    expect(plan.counts.notes).toBe(0);
    expect(plan.warnings).toContain("This backup contains no notes.");
  });

  it("rejects a file that is not JSON", () => {
    expect(() => planFolioBackupImport("not json")).toThrow(/not valid JSON/i);
  });

  it("rejects another JSON file", () => {
    expect(() =>
      planFolioBackupImport('{"format":"something-else","version":1,"notes":[]}')
    ).toThrow(/not a Folio JSON backup/i);
  });

  it("rejects a newer backup version", () => {
    expect(() =>
      planFolioBackupImport('{"format":"folio-backup","version":2,"notes":[]}')
    ).toThrow(/newer version/i);
  });

  it("rejects a backup without a notes list", () => {
    expect(() =>
      planFolioBackupImport('{"format":"folio-backup","version":1}')
    ).toThrow(/notes list/i);
  });
});
