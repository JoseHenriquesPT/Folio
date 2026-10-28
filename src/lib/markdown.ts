import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export interface MarkdownOptions {
  /** Maps an image source to the link that belongs in the export. */
  resolveImage?: (src: string) => string | null;
}

function createService(options: MarkdownOptions): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  service.use(gfm);

  // The plugin emits a single tilde and turndown pads list markers with three
  // spaces; both read badly in a file someone opens in another editor.
  service.addRule("strikethrough", {
    filter: (node) => ["DEL", "S", "STRIKE"].includes(node.nodeName),
    replacement: (content) => `~~${content}~~`,
  });

  service.addRule("listItem", {
    filter: "li",
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const parent = element.parentElement;
      if (!parent) return content;

      const ordered = parent.tagName === "OL";
      const start = Number.parseInt(parent.getAttribute("start") ?? "1", 10);
      const index = Array.from(parent.children).indexOf(element);
      const marker = ordered ? `${(Number.isNaN(start) ? 1 : start) + index}. ` : "- ";
      const indent = " ".repeat(marker.length);

      const lines = content
        .replace(/[ \t]+$/gm, "")
        .replace(/^\n+|\n+$/g, "")
        .split("\n");
      const kept = lines.filter((line, lineIndex) => {
        if (line !== "") return true;
        if (lineIndex === lines.length - 1) return false;
        return !/^([-*+]|\d+\.)\s/.test(lines[lineIndex + 1] ?? "");
      }).join("\n");

      if (kept.trim() === "") return "";
      return `${marker}${kept.replace(/\n/g, `\n${indent}`)}\n`;
    },
  });

  service.addRule("taskItem", {
    filter: (node) =>
      node.nodeName === "LI" &&
      node instanceof HTMLElement &&
      node.getAttribute("data-type") === "taskItem",
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const checked = element.getAttribute("data-checked") === "true";
      const text = content.trim().replace(/\n{3,}/g, "\n\n");
      if (text === "") return "";
      const indented = text.replace(/\n/g, "\n    ");
      return `- [${checked ? "x" : " "}] ${indented}\n`;
    },
  });

  service.addRule("image", {
    filter: "img",
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const original = element.getAttribute("src") ?? "";
      const src = options.resolveImage?.(original) ?? original;
      if (src === "") return "";

      const alt = (element.getAttribute("alt") ?? "").replace(/[[\]]/g, "\\$&");
      const title = element.getAttribute("title");
      return `![${alt}](${src}${title ? ` "${title}"` : ""})`;
    },
  });

  return service;
}

export function htmlToMarkdown(
  html: string,
  options: MarkdownOptions = {}
): string {
  if (html.trim() === "") return "";

  const markdown = createService(options).turndown(html);
  if (markdown.trim() === "") return "";

  return `${markdown.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

const parser = new DOMParser();

function trimLeading(element: HTMLElement): void {
  let child = element.firstChild;
  while (child) {
    if (child.nodeType !== Node.TEXT_NODE) return;

    const trimmed = (child.textContent ?? "").replace(/^\s+/, "");
    if (trimmed !== "") {
      child.textContent = trimmed;
      return;
    }

    const next = child.nextSibling;
    child.remove();
    child = next;
  }
}

function trimTrailing(element: HTMLElement): void {
  let child = element.lastChild;
  while (child) {
    if (child.nodeType !== Node.TEXT_NODE) return;

    const trimmed = (child.textContent ?? "").replace(/\s+$/, "");
    if (trimmed !== "") {
      child.textContent = trimmed;
      return;
    }

    const previous = child.previousSibling;
    child.remove();
    child = previous;
  }
}

function markdownTaskLists(html: string): string {
  if (!html.includes('type="checkbox"')) return html;

  const doc = parser.parseFromString(html, "text/html");

  for (const item of Array.from(doc.querySelectorAll("li"))) {
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (!checkbox) continue;

    item.setAttribute("data-type", "taskItem");
    item.setAttribute(
      "data-checked",
      checkbox.hasAttribute("checked") ? "true" : "false"
    );
    checkbox.remove();

    for (const child of Array.from(item.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() === "") {
        child.remove();
      }
    }

    if (!Array.from(item.children).some((child) => child.tagName === "P")) {
      const paragraph = doc.createElement("p");
      while (item.firstChild) paragraph.append(item.firstChild);
      item.append(paragraph);
    }

    for (const paragraph of Array.from(item.children)) {
      if (paragraph.tagName !== "P") continue;
      if ((paragraph.textContent ?? "").trim() === "" && !paragraph.querySelector("img")) {
        paragraph.remove();
        continue;
      }
      trimLeading(paragraph as HTMLElement);
      trimTrailing(paragraph as HTMLElement);
      break;
    }

    const lastParagraph = Array.from(item.children)
      .filter((child) => child.tagName === "P")
      .pop();
    if (lastParagraph) trimTrailing(lastParagraph as HTMLElement);
  }

  for (const list of Array.from(doc.querySelectorAll("ul"))) {
    const items = Array.from(list.children).filter((child) => child.tagName === "LI");
    if (items.every((item) => item.getAttribute("data-type") === "taskItem")) {
      list.setAttribute("data-type", "taskList");
    }
  }

  return doc.body.innerHTML;
}

export function markdownToHtml(markdown: string): string {
  const html = marked.parse(markdown, { gfm: true, async: false });
  return markdownTaskLists(typeof html === "string" ? html : "");
}
