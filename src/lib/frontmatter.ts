export type FrontMatterValue = string | string[] | boolean | null;
export type FrontMatterData = Record<string, FrontMatterValue>;

export interface NoteFrontMatter {
  title: string;
  notebook?: string | null;
  tags?: string[];
  created?: string | null;
  updated?: string | null;
  archived?: boolean;
}

export interface ParsedFrontMatter {
  data: FrontMatterData;
  body: string;
}

const PLAIN_VALUE = /^[A-Za-z0-9_./][A-Za-z0-9_./ -]*$/;

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function scalar(value: string): string {
  if (PLAIN_VALUE.test(value) && value.trim() === value && !value.endsWith(" ")) {
    return value;
  }
  return quote(value);
}

function sequence(values: string[]): string {
  return `[${values.map(quote).join(", ")}]`;
}

export function formatFrontMatter(frontMatter: NoteFrontMatter): string {
  const lines = ["---", `title: ${scalar(frontMatter.title)}`];

  if (frontMatter.notebook) {
    lines.push(`notebook: ${scalar(frontMatter.notebook)}`);
  }

  lines.push(`tags: ${sequence(frontMatter.tags ?? [])}`);
  lines.push(
    `created: ${frontMatter.created ? quote(frontMatter.created) : "null"}`
  );
  lines.push(
    `updated: ${frontMatter.updated ? quote(frontMatter.updated) : "null"}`
  );

  if (frontMatter.archived) {
    lines.push("archived: true");
  }

  lines.push("---", "");
  return lines.join("\n");
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  return value;
}

function parseFlowSequence(value: string): string[] {
  const inner = value.slice(1, -1).trim();
  if (inner === "") return [];

  return inner.split(",").map((item) => unquote(item.trim()));
}

function parseValue(value: string): FrontMatterValue {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "~" || trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return parseFlowSequence(trimmed);
  }
  return unquote(trimmed);
}

export function parseFrontMatter(markdown: string): ParsedFrontMatter {
  const opening = /^---\r?\n/.exec(markdown);
  if (!opening) return { data: {}, body: markdown };

  const rest = markdown.slice(opening[0].length);
  const closing = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(rest);
  if (!closing) return { data: {}, body: markdown };

  const block = rest.slice(0, closing.index);
  const body = rest
    .slice(closing.index + closing[0].length)
    .replace(/^\r?\n/, "");
  const data: FrontMatterData = {};

  let pendingKey: string | null = null;
  let pendingList: string[] | null = null;

  for (const rawLine of block.split(/\r?\n/)) {
    if (rawLine.trim() === "" || rawLine.trimStart().startsWith("#")) continue;

    const listItem = /^\s+-\s+(.*)$/.exec(rawLine);
    if (listItem && pendingKey) {
      const existing = data[pendingKey];
      pendingList ??= Array.isArray(existing) ? existing : [];
      pendingList.push(unquote(listItem[1].trim()));
      data[pendingKey] = pendingList;
      continue;
    }

    const entry = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(rawLine);
    if (!entry) continue;

    pendingKey = entry[1];
    pendingList = null;
    data[pendingKey] = parseValue(entry[2]);
  }

  return { data, body };
}
