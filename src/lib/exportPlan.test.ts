import { describe, expect, it } from "vitest";
import { planJsonBackup, planNoteExport, planVaultExport } from "./exportPlan";
import type { ExportAttachment, ExportNote } from "./exportPlan";

const NOW = new Date("2026-10-28T09:00:00.000Z");

function note(overrides: Partial<ExportNote> & Pick<ExportNote, "id" | "title">): ExportNote {
  return {
    ownerId: "owner",
    bodyHtml: "<p>Body</p>",
    notebookId: null,
    archived: false,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    tags: [],
    ...overrides,
  };
}

function attachment(
  overrides: Partial<ExportAttachment> & Pick<ExportAttachment, "id" | "noteId">
): ExportAttachment {
  return {
    fileName: "shot.png",
    mimeType: "image/png",
    sizeBytes: 1234,
    ...overrides,
  };
}

const SOURCE = {
  ownerId: "owner",
  notebooks: [
    { id: "nb1", title: "Ideas", parentId: null },
    { id: "nb2", title: "Projects", parentId: null },
    { id: "nb3", title: "Web", parentId: "nb2" },
    { id: "nb4", title: "Empty", parentId: null },
  ],
  notes: [
    note({ id: "n1", title: "Card Games", notebookId: "nb1", tags: ["games", "family"] }),
    note({ id: "n2", title: "Card Games", notebookId: "nb1" }),
    note({
      id: "n3",
      title: "Deploy",
      notebookId: "nb3",
      archived: true,
      bodyHtml: '<p><img src="attachment:att1" alt="shot"></p><p>Ship it.</p>',
    }),
    note({ id: "n4", title: "Loose" }),
    note({ id: "n5", title: "Trashed", deletedAt: "2026-02-01T00:00:00.000Z" }),
    note({ id: "n6", title: "Shared with me", ownerId: "partner" }),
  ],
  attachments: [
    attachment({ id: "att1", noteId: "n3" }),
    attachment({ id: "att2", noteId: "n5", fileName: "gone.png" }),
  ],
};

describe("planVaultExport", () => {
  const plan = planVaultExport(SOURCE, { now: NOW });
  const paths = plan.files.map((file) => file.path);

  function file(path: string): string {
    const found = plan.files.find((entry) => entry.path === path);
    if (!found) throw new Error(`missing file ${path}`);
    return found.content;
  }

  it("names the export folder after the date", () => {
    expect(plan.root).toBe("folio-export-2026-10-28");
  });

  it("mirrors the notebook tree and de-duplicates titles", () => {
    expect(paths).toEqual([
      "README.txt",
      "manifest.json",
      "Ideas/Card Games.md",
      "Ideas/Card Games-2.md",
      "Loose.md",
      "Projects/Web/Deploy.md",
    ]);
  });

  it("writes front matter with notebook, tags, and timestamps", () => {
    expect(file("Ideas/Card Games.md")).toBe(
      [
        "---",
        "title: Card Games",
        "notebook: Ideas",
        'tags: ["games", "family"]',
        'created: "2026-01-01T00:00:00.000Z"',
        'updated: "2026-01-02T00:00:00.000Z"',
        "---",
        "Body",
        "",
      ].join("\n")
    );
  });

  it("marks archived notes and uses the full notebook path", () => {
    const markdown = file("Projects/Web/Deploy.md");

    expect(markdown).toContain("notebook: Projects / Web");
    expect(markdown).toContain("archived: true");
    expect(markdown).toContain("Ship it.");
  });

  it("links attachments relative to the note file", () => {
    expect(file("Projects/Web/Deploy.md")).toContain(
      "![shot](../../attachments/n3/shot.png)"
    );
    expect(plan.media).toEqual([
      {
        path: "attachments/n3/shot.png",
        attachment: expect.objectContaining({ id: "att1" }),
        mimeType: "image/png",
      },
    ]);
  });

  it("scopes the export to owned, non-trashed notes and reports exclusions", () => {
    const manifest = JSON.parse(file("manifest.json"));

    expect(manifest.notes.map((entry: { id: string }) => entry.id)).toEqual([
      "n1",
      "n2",
      "n4",
      "n3",
    ]);
    expect(manifest.excluded).toEqual({ trashed: 1, shared: 1 });
    expect(manifest.counts).toEqual({ notes: 4, notebooks: 4, attachments: 1 });
  });

  it("lists every owned notebook, including empty ones", () => {
    const manifest = JSON.parse(file("manifest.json"));

    expect(manifest.notebooks).toEqual([
      { id: "nb4", title: "Empty", path: "Empty" },
      { id: "nb1", title: "Ideas", path: "Ideas" },
      { id: "nb2", title: "Projects", path: "Projects" },
      { id: "nb3", title: "Web", path: "Projects / Web" },
    ]);
  });

  it("describes the archive in the README", () => {
    const readme = file("README.txt");

    expect(readme).toContain("Folio vault export");
    expect(readme).toContain("2026-10-28");
    expect(readme).toContain("4 notes");
    expect(readme).toContain("1 attachment");
    expect(readme).toContain("manifest.json");
  });

  it("keeps the manifest deterministic", () => {
    const again = planVaultExport(SOURCE, { now: NOW });

    expect(again.files).toEqual(plan.files);
    expect(again.media).toEqual(plan.media);
  });
});

describe("planNoteExport", () => {
  const deploy = SOURCE.notes[2];
  const attachments = [SOURCE.attachments[0]];

  it("exports a single Markdown file and warns about left-behind attachments", () => {
    const plan = planNoteExport({
      note: deploy,
      notebookPath: ["Projects", "Web"],
      attachments,
      zip: false,
      now: NOW,
    });

    expect(plan.files.map((file) => file.path)).toEqual(["Deploy.md"]);
    expect(plan.files[0].content).toContain("title: Deploy");
    expect(plan.warnings).toEqual([
      "The note has attachments. Download the zip to keep them.",
    ]);
  });

  it("bundles Markdown, HTML, and attachments in a zip", () => {
    const plan = planNoteExport({
      note: deploy,
      notebookPath: ["Projects", "Web"],
      attachments,
      zip: true,
      now: NOW,
    });

    expect(plan.files.map((file) => file.path)).toEqual(["Deploy.md", "Deploy.html"]);
    expect(plan.files[1].content).toContain("<title>Deploy</title>");
    expect(plan.files[1].content).toContain("Ship it.");
    expect(plan.files[0].content).toContain("![shot](attachments/shot.png)");
    expect(plan.media).toEqual([
      {
        path: "attachments/shot.png",
        attachment: expect.objectContaining({ id: "att1" }),
        mimeType: "image/png",
      },
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("falls back to a safe file name", () => {
    const plan = planNoteExport({
      note: note({ id: "n9", title: "" }),
      notebookPath: [],
      attachments: [],
      zip: false,
      now: NOW,
    });

    expect(plan.files[0].path).toBe("Untitled.md");
  });

  it("sanitises the exported HTML", () => {
    const plan = planNoteExport({
      note: note({ id: "n9", title: "Unsafe", bodyHtml: '<p>ok</p><script>alert(1)</script>' }),
      notebookPath: [],
      attachments: [],
      zip: true,
      now: NOW,
    });

    expect(plan.files[1].content).not.toContain("<script");
  });
});

describe("planJsonBackup", () => {
  const plan = planJsonBackup(SOURCE, { now: NOW });
  const backup = JSON.parse(plan.content);

  it("names the file after the date and stamps the format", () => {
    expect(plan.fileName).toBe("folio-backup-2026-10-28.json");
    expect(plan.content.endsWith("\n")).toBe(true);
    expect(backup).toMatchObject({
      format: "folio-backup",
      version: 1,
      app: "Folio",
      exportedAt: "2026-10-28T09:00:00.000Z",
    });
  });

  it("keeps full HTML bodies rather than rendered Markdown", () => {
    const deploy = backup.notes.find((entry: { id: string }) => entry.id === "n3");

    expect(deploy.bodyHtml).toBe(SOURCE.notes[2].bodyHtml);
    expect(deploy.archived).toBe(true);
    expect(deploy.notebookPath).toEqual(["Projects", "Web"]);
  });

  it("records the notebook tree, including empty notebooks", () => {
    expect(backup.notebooks).toEqual([
      { id: "nb4", title: "Empty", parentId: null, path: ["Empty"] },
      { id: "nb1", title: "Ideas", parentId: null, path: ["Ideas"] },
      { id: "nb2", title: "Projects", parentId: null, path: ["Projects"] },
      { id: "nb3", title: "Web", parentId: "nb2", path: ["Projects", "Web"] },
    ]);
  });

  it("scopes the backup like the vault export and reports exclusions", () => {
    expect(backup.notes.map((entry: { id: string }) => entry.id)).toEqual([
      "n1",
      "n2",
      "n4",
      "n3",
    ]);
    expect(backup.excluded).toEqual({ trashed: 1, shared: 1 });
    expect(backup.counts).toEqual({ notes: 4, notebooks: 4, attachments: 1, tags: 2 });
  });

  it("collects every tag once", () => {
    expect(backup.tags).toEqual(["family", "games"]);
  });

  it("lists attachments per note and as a flat manifest", () => {
    const deploy = backup.notes.find((entry: { id: string }) => entry.id === "n3");

    expect(deploy.attachments).toEqual([
      { id: "att1", fileName: "shot.png", mimeType: "image/png", sizeBytes: 1234 },
    ]);
    expect(backup.attachments).toEqual([
      {
        id: "att1",
        noteId: "n3",
        fileName: "shot.png",
        mimeType: "image/png",
        sizeBytes: 1234,
      },
    ]);
  });

  it("never writes share rows or credential state", () => {
    expect(JSON.stringify(backup)).not.toContain("sharedWith");
    expect(JSON.stringify(backup)).not.toContain("note_shares");
  });
});
