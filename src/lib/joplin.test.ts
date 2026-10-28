import { describe, expect, it } from "vitest";
import { planJoplinImport } from "./joplin";
import { readTar } from "./tar";
import { buildTar } from "../test/tarBuilder";
import {
  JOPLIN_FILES,
  NOTE_CARD_GAMES,
  NOTE_DELETED,
  NOTE_DEPLOY,
  NOTEBOOK_EMPTY,
  NOTEBOOK_IDEAS,
  NOTEBOOK_PROJECTS,
  NOTEBOOK_WEB,
  RESOURCE_IMAGE,
  RESOURCE_MISSING,
  RESOURCE_TEXT,
} from "./__fixtures__/joplin";

function fixtureArchive() {
  return readTar(
    buildTar(JOPLIN_FILES.map((file) => ({ path: file.path, content: file.content })))
  );
}

describe("planJoplinImport", () => {
  const plan = planJoplinImport(fixtureArchive());

  it("keeps the notebook tree with parents first", () => {
    expect(plan.notebooks.map((notebook) => notebook.id)).toEqual([
      NOTEBOOK_EMPTY,
      NOTEBOOK_IDEAS,
      NOTEBOOK_PROJECTS,
      NOTEBOOK_WEB,
    ]);

    const web = plan.notebooks.find((notebook) => notebook.id === NOTEBOOK_WEB);
    expect(web).toMatchObject({ title: "Web", parentId: NOTEBOOK_PROJECTS });
  });

  it("imports live notes and skips trashed ones", () => {
    expect(plan.notes.map((note) => note.id)).not.toContain(NOTE_DELETED);
    expect(plan.notes.map((note) => note.id).sort()).toEqual(
      [
        "88888888888888888888888888888888",
        "66666666666666666666666666666666",
        NOTE_CARD_GAMES,
        NOTE_DEPLOY,
      ].sort()
    );
    expect(plan.skipped).toContainEqual({
      path: `${NOTE_DELETED}.md`,
      reason: "Trashed in Joplin",
    });
  });

  it("keeps titles, timestamps, and notebook assignment", () => {
    const cardGames = plan.notes.find((note) => note.id === NOTE_CARD_GAMES);

    expect(cardGames).toMatchObject({
      title: "Card Games",
      notebookId: NOTEBOOK_IDEAS,
      createdAt: "2026-09-07T18:59:22.990Z",
      updatedAt: "2026-09-07T19:00:16.462Z",
      resourceIds: [RESOURCE_IMAGE],
    });
    expect(cardGames?.bodyHtml).toContain("<li>Gin Rummy</li>");
  });

  it("converts task lists into the editor shape", () => {
    const cardGames = plan.notes.find((note) => note.id === NOTE_CARD_GAMES);

    expect(cardGames?.bodyHtml).toContain('data-type="taskList"');
    expect(cardGames?.bodyHtml).toContain('data-checked="true"');
  });

  it("rewrites resource links to attachment refs", () => {
    const deploy = plan.notes.find((note) => note.id === NOTE_DEPLOY);

    expect(deploy?.bodyHtml).toContain(`attachment:${RESOURCE_TEXT}`);
    expect(deploy?.resourceIds).toEqual([RESOURCE_TEXT]);
    expect(deploy?.bodyHtml).toContain("<table>");
  });

  it("unwraps links to other notes", () => {
    const deploy = plan.notes.find((note) => note.id === NOTE_DEPLOY);

    expect(deploy?.bodyHtml).toContain("the rules");
    expect(deploy?.bodyHtml).not.toContain(`:/${NOTE_CARD_GAMES}`);
    expect(plan.warnings).toContain(
      "A link to another note was kept as plain text."
    );
  });

  it("strips scripts and event handlers", () => {
    const deploy = plan.notes.find((note) => note.id === NOTE_DEPLOY);

    expect(deploy?.bodyHtml).not.toContain("<script");
    expect(deploy?.bodyHtml).not.toContain("onerror");
  });

  it("drops images that point at a resource missing from the export", () => {
    const forward = plan.notes.find(
      (note) => note.id === "66666666666666666666666666666666"
    );

    expect(forward?.bodyHtml).not.toContain("deadbeef");
    expect(plan.warnings).toContain(
      "An image or link pointed at something that is not in the export."
    );
  });

  it("collects resources that have bytes", () => {
    expect(plan.resources.map((resource) => resource.id).sort()).toEqual(
      [RESOURCE_IMAGE, RESOURCE_TEXT].sort()
    );

    const image = plan.resources.find((resource) => resource.id === RESOURCE_IMAGE);
    expect(image).toMatchObject({ mimeType: "image/png", fileName: `${RESOURCE_IMAGE}.png` });
    expect(image?.bytes.length).toBeGreaterThan(0);

    expect(plan.skipped).toContainEqual({
      path: `resources/${RESOURCE_MISSING}.pdf`,
      reason: "Attachment is missing from the export",
    });
  });

  it("reports every skipped file and counts", () => {
    expect(plan.skipped).toContainEqual({
      path: "notes.txt",
      reason: "Not a Joplin item or attachment",
    });
    expect(plan.counts).toEqual({
      notes: 4,
      notebooks: 4,
      resources: 2,
      skipped: 3,
      rewrittenLinks: 2,
    });
  });

  it("keeps notes without a notebook instead of guessing", () => {
    const loose = plan.notes.find(
      (note) => note.id === "88888888888888888888888888888888"
    );

    expect(loose?.notebookId).toBeNull();
  });

  it("rejects an empty archive", () => {
    expect(planJoplinImport([]).counts.notes).toBe(0);
    expect(planJoplinImport([]).warnings).toContain(
      "This export contains no notes."
    );
  });
});
