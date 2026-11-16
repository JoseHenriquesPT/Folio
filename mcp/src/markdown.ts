import { Node, parseHTML } from "linkedom";
import sanitizeHtml from "sanitize-html";
import { markdownToHtml } from "../../src/lib/markdown";

// The shared converter handles task lists in a DOM. In the browser that DOM is
// the real document; here it is linkedom. The parser wrapper accepts fragments
// because linkedom's DOMParser only fills <body> for a full document.
class FragmentDOMParser {
  parseFromString(html: string): Document {
    const { document } = parseHTML(
      `<!doctype html><html><body>${html}</body></html>`
    );
    return document as unknown as Document;
  }
}

globalThis.DOMParser = FragmentDOMParser as unknown as typeof DOMParser;
globalThis.Node = Node as unknown as typeof globalThis.Node;
globalThis.document = parseHTML(
  "<!doctype html><html><body></body></html>"
).document as unknown as Document;

// Mirrors src/lib/sanitize.ts (the editor's allowlist).
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

const ALLOWED_SCHEMES = [
  "http",
  "https",
  "mailto",
  "tel",
  "callto",
  "sms",
  "cid",
  "xmpp",
  "attachment",
];

export function markdownToSafeHtml(markdown: string): string {
  return sanitizeHtml(markdownToHtml(markdown), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { "*": ALLOWED_ATTR },
    allowedSchemes: ALLOWED_SCHEMES,
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
  });
}
