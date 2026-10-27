import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "strike",
  "del",
  "u",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "hr",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
  "div",
  "span",
  "label",
  "input",
];

const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "src",
  "alt",
  "title",
  "class",
  "colspan",
  "rowspan",
  "data-type",
  "data-checked",
  "type",
  "checked",
  "disabled",
];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style", "onerror", "onclick", "onload"],
    ALLOW_DATA_ATTR: false,
  });
}

export function htmlToPlainText(html: string): string {
  const clean = sanitizeHtml(html);

  if (typeof DOMParser === "undefined") {
    return clean.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  const spaced = clean
    .replace(/<\/(p|h[1-6]|li|blockquote|tr|div|pre)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ");
  const doc = new DOMParser().parseFromString(spaced, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
