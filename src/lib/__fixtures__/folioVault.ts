import { buildZip } from "../archive";
import { formatFrontMatter } from "../frontmatter";

export const VAULT_NOTEBOOK_LEARNING = "11111111-1111-4111-8111-111111111111";
export const VAULT_NOTEBOOK_COURSES = "22222222-2222-4222-8222-222222222222";
export const VAULT_NOTEBOOK_EMPTY = "33333333-3333-4333-8333-333333333333";

export const VAULT_NOTE_HTML = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const VAULT_NOTE_LOOSE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const VAULT_NOTE_ARCHIVED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export const VAULT_ATTACHMENT_IMAGE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const VAULT_ATTACHMENT_TEXT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const VAULT_ATTACHMENT_MISSING = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function pngBytes(): Uint8Array {
  return Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));
}

const HTML_NOTE_PATH = "Learning/Courses/HTML Basics.md";
const LOOSE_NOTE_PATH = "Loose thought.md";
const ARCHIVED_NOTE_PATH = "Learning/Archived idea.md";

const IMAGE_PATH = `attachments/${VAULT_NOTE_HTML}/diagram one.png`;
const TEXT_PATH = `attachments/${VAULT_NOTE_HTML}/notes.txt`;
const MISSING_PATH = `attachments/${VAULT_NOTE_HTML}/gone.png`;

export const VAULT_MANIFEST = {
  format: "folio-vault-export" as const,
  version: 1 as const,
  app: "Folio" as const,
  exportedAt: "2026-11-10T09:00:00.000Z",
  counts: { notes: 3, notebooks: 3, attachments: 3 },
  notebooks: [
    { id: VAULT_NOTEBOOK_LEARNING, title: "Learning", path: "Learning" },
    {
      id: VAULT_NOTEBOOK_COURSES,
      title: "Courses",
      path: "Learning / Courses",
    },
    { id: VAULT_NOTEBOOK_EMPTY, title: "Empty shelf", path: "Empty shelf" },
  ],
  notes: [
    {
      id: VAULT_NOTE_HTML,
      title: "HTML Basics",
      path: HTML_NOTE_PATH,
      notebook: "Learning / Courses",
      tags: ["web", "course"],
      created: "2026-09-07T18:59:22.990Z",
      updated: "2026-09-07T19:00:16.462Z",
      archived: false,
      attachments: [
        {
          fileName: "diagram one.png",
          path: IMAGE_PATH,
          mimeType: "image/png",
          sizeBytes: pngBytes().byteLength,
        },
        {
          fileName: "notes.txt",
          path: TEXT_PATH,
          mimeType: "text/plain",
          sizeBytes: 12,
        },
        {
          fileName: "gone.png",
          path: MISSING_PATH,
          mimeType: "image/png",
          sizeBytes: 4,
        },
      ],
    },
    {
      id: VAULT_NOTE_LOOSE,
      title: "Loose thought",
      path: LOOSE_NOTE_PATH,
      notebook: null,
      tags: [],
      created: "2025-02-01T00:00:00.000Z",
      updated: "2025-02-01T00:00:00.000Z",
      archived: false,
      attachments: [],
    },
    {
      id: VAULT_NOTE_ARCHIVED,
      title: "Archived idea",
      path: ARCHIVED_NOTE_PATH,
      notebook: "Learning",
      tags: ["old"],
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-02T00:00:00.000Z",
      archived: true,
      attachments: [],
    },
  ],
  attachments: [
    {
      id: VAULT_ATTACHMENT_IMAGE,
      noteId: VAULT_NOTE_HTML,
      fileName: "diagram one.png",
      path: IMAGE_PATH,
      mimeType: "image/png",
      sizeBytes: pngBytes().byteLength,
    },
    {
      id: VAULT_ATTACHMENT_TEXT,
      noteId: VAULT_NOTE_HTML,
      fileName: "notes.txt",
      path: TEXT_PATH,
      mimeType: "text/plain",
      sizeBytes: 12,
    },
    {
      id: VAULT_ATTACHMENT_MISSING,
      noteId: VAULT_NOTE_HTML,
      fileName: "gone.png",
      path: MISSING_PATH,
      mimeType: "image/png",
      sizeBytes: 4,
    },
  ],
  excluded: { trashed: 0, shared: 0 },
};

export const VAULT_FILES: Array<{ path: string; content: string | Uint8Array }> = [
  {
    path: "README.txt",
    content: "Folio vault export\n",
  },
  {
    path: "manifest.json",
    content: `${JSON.stringify(VAULT_MANIFEST, null, 2)}\n`,
  },
  {
    path: HTML_NOTE_PATH,
    content: `${formatFrontMatter({
      title: "HTML Basics",
      notebook: "Learning / Courses",
      tags: ["web", "course"],
      created: "2026-09-07T18:59:22.990Z",
      updated: "2026-09-07T19:00:16.462Z",
      archived: false,
    })}# HTML Basics

A paragraph with **bold** text.

![diagram](../../${IMAGE_PATH} "A diagram")

![missing](../../${MISSING_PATH})

<script>alert('x')</script>
`,
  },
  {
    path: LOOSE_NOTE_PATH,
    content: `${formatFrontMatter({
      title: "Loose thought",
      notebook: null,
      tags: [],
      created: "2025-02-01T00:00:00.000Z",
      updated: "2025-02-01T00:00:00.000Z",
    })}No notebook here.
`,
  },
  {
    path: ARCHIVED_NOTE_PATH,
    content: `${formatFrontMatter({
      title: "Archived idea",
      notebook: "Learning",
      tags: ["old"],
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-02T00:00:00.000Z",
      archived: true,
    })}Archived but kept.
`,
  },
  { path: IMAGE_PATH, content: pngBytes() },
  { path: TEXT_PATH, content: "release log\n" },
  { path: "junk.bin", content: new Uint8Array([9, 9]) },
];

export function buildFolioVaultZip(): Promise<Uint8Array> {
  return buildZip(
    VAULT_FILES.map((file) => ({
      path: file.path,
      ...(typeof file.content === "string"
        ? { text: file.content }
        : { bytes: file.content }),
    }))
  );
}
