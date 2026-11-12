import { describe, expect, it } from "vitest";
import type { JoplinImportPlan } from "./joplin";
import {
  importRootName,
  orderNotebooks,
  planFromJoplin,
  type ImportNotebook,
} from "./importPlan";

const NOW = new Date("2026-11-12T10:00:00.000Z");

function joplinPlan(overrides: Partial<JoplinImportPlan> = {}): JoplinImportPlan {
  return {
    notebooks: [
      { id: "nb-root", title: "Ideas", parentId: null, createdAt: null, updatedAt: null },
      { id: "nb-child", title: "Web", parentId: "nb-root", createdAt: null, updatedAt: null },
    ],
    notes: [
      {
        id: "note-1",
        title: "Card Games",
        bodyHtml: '<p><img src="attachment:res-1"></p>',
        notebookId: "nb-child",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-02-01T00:00:00.000Z",
        resourceIds: ["res-1"],
      },
    ],
    resources: [
      {
        id: "res-1",
        fileName: "shot.png",
        mimeType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
      },
    ],
    skipped: [{ path: "junk.bin", reason: "Not a Joplin item or attachment" }],
    warnings: ["A link to another note was kept as plain text."],
    counts: { notes: 1, notebooks: 2, resources: 1, skipped: 1, rewrittenLinks: 2 },
    ...overrides,
  };
}

describe("planFromJoplin", () => {
  it("maps the Joplin tree, notes, and files onto the shared plan", () => {
    const plan = planFromJoplin(joplinPlan());

    expect(plan).toMatchObject({
      source: "joplin",
      rootLabel: "Joplin",
      notebooks: [
        { id: "nb-root", title: "Ideas", parentId: null },
        { id: "nb-child", title: "Web", parentId: "nb-root" },
      ],
      notes: [
        {
          id: "note-1",
          title: "Card Games",
          bodyHtml: '<p><img src="attachment:res-1"></p>',
          notebookId: "nb-child",
          archived: false,
          tags: [],
          attachmentIds: ["res-1"],
        },
      ],
      attachments: [
        {
          id: "res-1",
          sourceNoteId: null,
          fileName: "shot.png",
          mimeType: "image/png",
          sizeBytes: 3,
        },
      ],
      skipped: [{ path: "junk.bin", reason: "Not a Joplin item or attachment" }],
      warnings: ["A link to another note was kept as plain text."],
      counts: {
        notes: 1,
        notebooks: 2,
        attachments: 1,
        tags: 0,
        skipped: 1,
        linksRewritten: 2,
      },
    });
    expect(plan.attachments[0].bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("keeps resources out of note lists when Joplin did not link them", () => {
    const plan = planFromJoplin(
      joplinPlan({
        notes: [
          {
            id: "note-1",
            title: "Empty",
            bodyHtml: "<p>No files</p>",
            notebookId: null,
            createdAt: null,
            updatedAt: null,
            resourceIds: [],
          },
        ],
      })
    );

    expect(plan.notes[0].attachmentIds).toEqual([]);
    expect(plan.attachments.map((item) => item.id)).toEqual(["res-1"]);
  });
});

describe("importRootName", () => {
  it("dates the wrapper notebook by source and day", () => {
    expect(importRootName("Joplin", NOW)).toBe("Imported from Joplin — 2026-11-12");
    expect(importRootName("Folio", NOW)).toBe("Imported from Folio — 2026-11-12");
  });
});

describe("orderNotebooks", () => {
  it("puts parents before children and keeps sibling order stable", () => {
    const notebooks: ImportNotebook[] = [
      { id: "grandchild", title: "A", parentId: "child" },
      { id: "root-b", title: "B", parentId: null },
      { id: "child", title: "C", parentId: "root" },
      { id: "root", title: "D", parentId: null },
    ];

    expect(orderNotebooks(notebooks).map((item) => item.id)).toEqual([
      "root-b",
      "root",
      "child",
      "grandchild",
    ]);
  });

  it("treats a missing parent as a root", () => {
    const notebooks: ImportNotebook[] = [
      { id: "child", title: "Child", parentId: "gone" },
      { id: "root", title: "Root", parentId: null },
    ];

    expect(orderNotebooks(notebooks).map((item) => item.id)).toEqual([
      "child",
      "root",
    ]);
  });
});
