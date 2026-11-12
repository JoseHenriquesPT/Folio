import { describe, expect, it } from "vitest";
import { buildZip } from "./archive";
import { planFolioVaultImport } from "./folioVault";
import {
  VAULT_ATTACHMENT_IMAGE,
  VAULT_ATTACHMENT_TEXT,
  VAULT_FILES,
  VAULT_MANIFEST,
  VAULT_NOTE_ARCHIVED,
  VAULT_NOTE_HTML,
  VAULT_NOTE_LOOSE,
  buildFolioVaultZip,
} from "./__fixtures__/folioVault";

interface ZipOverrides {
  manifest?: unknown;
  omit?: string[];
}

async function planFromZip(overrides: ZipOverrides = {}) {
  const manifest = overrides.manifest ?? VAULT_MANIFEST;
  const omit = new Set(overrides.omit ?? []);
  const entries = VAULT_FILES.filter(
    (file) => !omit.has(file.path) && file.path !== "manifest.json"
  ).map((file) =>
    typeof file.content === "string"
      ? { path: file.path, text: file.content }
      : { path: file.path, bytes: file.content }
  );

  entries.push({
    path: "manifest.json",
    text: `${JSON.stringify(manifest)}\n`,
  });

  return planFolioVaultImport(await buildZip(entries));
}

describe("planFolioVaultImport", () => {
  it("rebuilds the notebook tree from the manifest paths", async () => {
    const plan = await planFolioVaultImport(await buildFolioVaultZip());
    const learning = plan.notebooks.find((item) => item.title === "Learning");
    const courses = plan.notebooks.find((item) => item.title === "Courses");

    expect(plan.source).toBe("folio-vault");
    expect(plan.rootLabel).toBe("Folio");
    expect(learning).toMatchObject({ parentId: null });
    expect(courses).toMatchObject({ parentId: learning?.id });
    expect(plan.notebooks.map((item) => item.title)).toContain("Empty shelf");
    expect(plan.counts.notebooks).toBe(3);
  });

  it("restores note metadata, tags, archive state, and notebook assignment", async () => {
    const plan = await planFolioVaultImport(await buildFolioVaultZip());
    const courses = plan.notebooks.find((item) => item.title === "Courses");
    const learning = plan.notebooks.find((item) => item.title === "Learning");
    const html = plan.notes.find((item) => item.id === VAULT_NOTE_HTML);
    const archived = plan.notes.find((item) => item.id === VAULT_NOTE_ARCHIVED);

    expect(plan.notes).toHaveLength(3);
    expect(html).toMatchObject({
      title: "HTML Basics",
      notebookId: courses?.id,
      tags: ["web", "course"],
      archived: false,
      createdAt: "2026-09-07T18:59:22.990Z",
      updatedAt: "2026-09-07T19:00:16.462Z",
    });
    expect(archived).toMatchObject({
      title: "Archived idea",
      notebookId: learning?.id,
      archived: true,
    });
    expect(plan.notes.find((item) => item.id === VAULT_NOTE_LOOSE)?.notebookId).toBeNull();
    expect(plan.counts.tags).toBe(3);
  });

  it("rewrites relative image links, including names with spaces", async () => {
    const plan = await planFolioVaultImport(await buildFolioVaultZip());
    const body = plan.notes.find((item) => item.id === VAULT_NOTE_HTML)?.bodyHtml ?? "";

    expect(body).toContain(`<img src="attachment:${VAULT_ATTACHMENT_IMAGE}"`);
    expect(body).toContain('alt="diagram"');
    expect(body).toContain("<strong>bold</strong>");
    expect(body).not.toContain("diagram one.png");
    expect(body).not.toContain("gone.png");
    expect(body).not.toContain("<script");
  });

  it("lists every file the note owned, not only the inline images", async () => {
    const plan = await planFolioVaultImport(await buildFolioVaultZip());
    const html = plan.notes.find((item) => item.id === VAULT_NOTE_HTML);

    expect(html?.attachmentIds).toEqual([
      VAULT_ATTACHMENT_IMAGE,
      VAULT_ATTACHMENT_TEXT,
    ]);
    expect(plan.attachments.map((item) => item.id)).toEqual([
      VAULT_ATTACHMENT_IMAGE,
      VAULT_ATTACHMENT_TEXT,
    ]);
    expect(plan.attachments[0].bytes).toBeInstanceOf(Uint8Array);
    expect(plan.attachments[0].sizeBytes).toBe(
      plan.attachments[0].bytes?.byteLength
    );
  });

  it("reports missing attachments and unreferenced files", async () => {
    const plan = await planFolioVaultImport(await buildFolioVaultZip());

    expect(plan.skipped).toContainEqual({
      path: `attachments/${VAULT_NOTE_HTML}/gone.png`,
      reason: "Attachment is missing from the archive",
    });
    expect(plan.skipped).toContainEqual({
      path: "junk.bin",
      reason: "Not referenced by the manifest",
    });
    expect(plan.skipped.map((item) => item.path)).not.toContain("README.txt");
    expect(plan.counts).toMatchObject({
      notes: 3,
      attachments: 2,
      skipped: 2,
    });
    expect(plan.warnings).toContain(
      "Some images or file links pointed at files missing from the archive and were removed."
    );
  });

  it("prefers the note file's front matter over a stale manifest entry", async () => {
    const manifest = {
      ...VAULT_MANIFEST,
      notes: VAULT_MANIFEST.notes.map((note) =>
        note.id === VAULT_NOTE_HTML
          ? {
              ...note,
              title: "Stale title",
              tags: ["manifest-only"],
              created: "1999-01-01T00:00:00.000Z",
              updated: "1999-01-02T00:00:00.000Z",
            }
          : note
      ),
    };

    const plan = await planFromZip({ manifest });
    const html = plan.notes.find((item) => item.id === VAULT_NOTE_HTML);

    expect(html).toMatchObject({
      title: "HTML Basics",
      tags: ["web", "course"],
      createdAt: "2026-09-07T18:59:22.990Z",
      updatedAt: "2026-09-07T19:00:16.462Z",
    });
  });

  it("skips a note whose file is missing from the zip", async () => {
    const plan = await planFromZip({ omit: ["Loose thought.md"] });

    expect(plan.notes.map((item) => item.id)).not.toContain(VAULT_NOTE_LOOSE);
    expect(plan.counts.notes).toBe(2);
    expect(plan.skipped).toContainEqual({
      path: "Loose thought.md",
      reason: "Note file is missing from the archive",
    });
  });

  it("rejects a zip without a Folio manifest", async () => {
    const zip = await buildZip([{ path: "readme.txt", text: "hello" }]);

    await expect(planFolioVaultImport(zip)).rejects.toThrow(
      /not a Folio vault export/i
    );
  });

  it("rejects a newer manifest version", async () => {
    const manifest = { ...VAULT_MANIFEST, version: 2 };

    await expect(planFromZip({ manifest })).rejects.toThrow(/newer version/i);
  });
});
