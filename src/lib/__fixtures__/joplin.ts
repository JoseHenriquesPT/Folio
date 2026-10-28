export interface JoplinFixtureFile {
  path: string;
  content: string | Uint8Array;
}

interface ItemInput {
  id: string;
  type: 1 | 2 | 4;
  title: string;
  parentId?: string;
  body?: string;
  created?: string;
  updated?: string;
  deleted?: number;
  extra?: Record<string, string>;
}

function metadataLines(input: ItemInput): string[] {
  const lines = [`id: ${input.id}`];

  if (input.type === 4) {
    lines.push(
      `mime: ${input.extra?.mime ?? "application/octet-stream"}`,
      `filename: ${input.extra?.filename ?? ""}`
    );
  }

  if (input.type !== 4) {
    lines.push(`parent_id: ${input.parentId ?? ""}`);
  }

  lines.push(
    `created_time: ${input.created ?? "2026-01-01T00:00:00.000Z"}`,
    `updated_time: ${input.updated ?? "2026-01-02T00:00:00.000Z"}`,
    "user_created_time: 2026-01-01T00:00:00.000Z",
    "user_updated_time: 2026-01-02T00:00:00.000Z"
  );

  if (input.type === 2) {
    lines.push(`icon: ${input.extra?.icon ?? ""}`);
  }

  lines.push(
    "is_shared: 0",
    "share_id: ",
    "master_key_id: ",
    "user_data: ",
    `deleted_time: ${input.deleted ?? 0}`,
    `type_: ${input.type}`
  );

  return lines;
}

export function joplinItem(input: ItemInput): JoplinFixtureFile {
  const sections = [input.title];
  if (input.body) sections.push(input.body);
  sections.push(metadataLines(input).join("\n"));

  return {
    path: `${input.id}.md`,
    content: `${sections.join("\n\n")}\n`,
  };
}

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const NOTEBOOK_IDEAS = "11111111111111111111111111111111";
export const NOTEBOOK_PROJECTS = "22222222222222222222222222222222";
export const NOTEBOOK_WEB = "33333333333333333333333333333333";
export const NOTEBOOK_EMPTY = "44444444444444444444444444444444";

export const NOTE_CARD_GAMES = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const NOTE_DEPLOY = "99999999999999999999999999999999";
export const NOTE_LOOSE = "88888888888888888888888888888888";
export const NOTE_DELETED = "77777777777777777777777777777777";
export const NOTE_FORWARD = "66666666666666666666666666666666";

export const RESOURCE_IMAGE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const RESOURCE_TEXT = "cccccccccccccccccccccccccccccccc";
export const RESOURCE_MISSING = "dddddddddddddddddddddddddddddddd";

/** A small, sanitised vault shaped like a Joplin JEX (tar of the raw export). */
export const JOPLIN_FILES: JoplinFixtureFile[] = [
  joplinItem({ id: NOTEBOOK_IDEAS, type: 2, title: "Ideas", extra: { icon: '{"emoji":"sparkles","type":1}' } }),
  joplinItem({ id: NOTEBOOK_PROJECTS, type: 2, title: "Projects" }),
  joplinItem({ id: NOTEBOOK_WEB, type: 2, title: "Web", parentId: NOTEBOOK_PROJECTS }),
  joplinItem({ id: NOTEBOOK_EMPTY, type: 2, title: "Archive 2025" }),

  joplinItem({
    id: NOTE_CARD_GAMES,
    type: 1,
    title: "Card Games",
    parentId: NOTEBOOK_IDEAS,
    created: "2026-09-07T18:59:22.990Z",
    updated: "2026-09-07T19:00:16.462Z",
    body: [
      "- Gin Rummy",
      "- Cabeo",
      "",
      "Checklist:",
      "",
      "- [x] buy cards",
      "- [ ] print scoresheet",
      "",
      "![table](:/" + RESOURCE_IMAGE + ")",
    ].join("\n"),
  }),

  joplinItem({
    id: NOTE_DEPLOY,
    type: 1,
    title: 'Deploy: "prod" checklist',
    parentId: NOTEBOOK_WEB,
    body: [
      "See [the rules](:/" + NOTE_CARD_GAMES + ") and [the log](./resources/" + RESOURCE_TEXT + ".txt).",
      "",
      "<script>alert('x')</script>",
      "",
      '<img src="x" onerror="alert(1)">',
      "",
      "| Step | Owner |",
      "| --- | --- |",
      "| build | me |",
    ].join("\n"),
  }),

  joplinItem({
    id: NOTE_LOOSE,
    type: 1,
    title: "Loose thought",
    body: "No notebook here.",
  }),

  joplinItem({
    id: NOTE_DELETED,
    type: 1,
    title: "Deleted idea",
    parentId: NOTEBOOK_IDEAS,
    deleted: 1758000000000,
    body: "Trashed notes are not imported.",
  }),

  joplinItem({
    id: NOTE_FORWARD,
    type: 1,
    title: "Forward link",
    parentId: NOTEBOOK_IDEAS,
    body: "Broken image: ![gone](:/" + "deadbeefdeadbeefdeadbeefdeadbeef" + ")",
  }),

  joplinItem({
    id: RESOURCE_IMAGE,
    type: 4,
    title: `${RESOURCE_IMAGE}.png`,
    extra: { mime: "image/png" },
  }),
  joplinItem({
    id: RESOURCE_TEXT,
    type: 4,
    title: `${RESOURCE_TEXT}.txt`,
    extra: { mime: "text/plain" },
  }),
  joplinItem({
    id: RESOURCE_MISSING,
    type: 4,
    title: `${RESOURCE_MISSING}.pdf`,
    extra: { mime: "application/pdf" },
  }),

  { path: `resources/${RESOURCE_IMAGE}.png`, content: bytes(PNG_BASE64) },
  { path: `resources/${RESOURCE_TEXT}.txt`, content: "release log\n" },
  { path: "notes.txt", content: "not part of a Joplin export\n" },
];
