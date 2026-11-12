export const BACKUP_NOTEBOOK_IDEAS = "11111111-1111-4111-8111-111111111111";
export const BACKUP_NOTEBOOK_WEB = "22222222-2222-4222-8222-222222222222";

export const BACKUP_NOTE_CARD_GAMES = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const BACKUP_NOTE_ARCHIVED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const BACKUP_NOTE_LOOSE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export const BACKUP_ATTACHMENT_IMAGE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const BACKUP_ATTACHMENT_RULES = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

export function folioBackupFixture() {
  return {
    format: "folio-backup" as const,
    version: 1 as const,
    app: "Folio" as const,
    exportedAt: "2026-11-10T09:00:00.000Z",
    counts: { notes: 3, notebooks: 2, attachments: 2, tags: 3 },
    tags: ["Games", "Ideas", "fun"],
    notebooks: [
      {
        id: BACKUP_NOTEBOOK_IDEAS,
        title: "Ideas",
        parentId: null,
        path: ["Ideas"],
      },
      {
        id: BACKUP_NOTEBOOK_WEB,
        title: "Web",
        parentId: BACKUP_NOTEBOOK_IDEAS,
        path: ["Ideas", "Web"],
      },
    ],
    notes: [
      {
        id: BACKUP_NOTE_CARD_GAMES,
        title: "Card Games",
        bodyHtml: [
          "<h2>Card Games</h2>",
          "<p>Hello <strong>world</strong>.</p>",
          `<img src="attachment:${BACKUP_ATTACHMENT_IMAGE}" alt="table">`,
          "<script>alert('x')</script>",
          '<img src="x" onerror="alert(1)">',
        ].join(""),
        notebookId: BACKUP_NOTEBOOK_WEB,
        notebookPath: ["Ideas", "Web"],
        tags: ["Games", "fun"],
        archived: false,
        createdAt: "2026-09-07T18:59:22.990Z",
        updatedAt: "2026-09-07T19:00:16.462Z",
        attachments: [
          {
            id: BACKUP_ATTACHMENT_IMAGE,
            fileName: "table.png",
            mimeType: "image/png",
            sizeBytes: 3,
          },
          {
            id: BACKUP_ATTACHMENT_RULES,
            fileName: "rules.txt",
            mimeType: "text/plain",
            sizeBytes: 12,
          },
        ],
      },
      {
        id: BACKUP_NOTE_ARCHIVED,
        title: "Old idea",
        bodyHtml: "<p>Archived but kept.</p>",
        notebookId: BACKUP_NOTEBOOK_IDEAS,
        notebookPath: ["Ideas"],
        tags: ["Ideas"],
        archived: true,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
        attachments: [],
      },
      {
        id: BACKUP_NOTE_LOOSE,
        title: "Loose thought",
        bodyHtml: "<p>No notebook here.</p>",
        notebookId: null,
        notebookPath: null,
        tags: [],
        archived: false,
        createdAt: "2025-02-01T00:00:00.000Z",
        updatedAt: "2025-02-01T00:00:00.000Z",
        attachments: [],
      },
    ],
    attachments: [
      {
        id: BACKUP_ATTACHMENT_IMAGE,
        noteId: BACKUP_NOTE_CARD_GAMES,
        fileName: "table.png",
        mimeType: "image/png",
        sizeBytes: 3,
      },
      {
        id: BACKUP_ATTACHMENT_RULES,
        noteId: BACKUP_NOTE_CARD_GAMES,
        fileName: "rules.txt",
        mimeType: "text/plain",
        sizeBytes: 12,
      },
    ],
    excluded: { trashed: 0, shared: 0 },
  };
}
