import { describe, expect, it } from "vitest";
import editorCss from "./editor.css?raw";
import indexHtml from "../../index.html?raw";

// Guards the phone layout: the keyboard must squeeze only the note, the title
// rows scroll away with the note while the formatting toolbar stays pinned
// above the text, and the attachment bar gets out of the way while typing.

function cssRule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `missing rule for ${selector}`).toBeGreaterThan(-1);
  const start = at + selector.length + 1;
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

describe("editor keyboard layout", () => {
  it("asks the browser to resize content when the keyboard opens", () => {
    const viewport = indexHtml.match(
      /<meta\s+name="viewport"\s+content="([^"]+)"/s
    )?.[1];
    expect(viewport).toBeDefined();
    expect(viewport).toContain("interactive-widget=resizes-content");
  });

  it("keeps the formatting toolbar pinned instead of letting it compress", () => {
    const rule = cssRule(editorCss, ".editor-toolbar");
    expect(rule).toContain("position: sticky");
    expect(rule).toContain("top: 0");
    expect(rule).toContain("min-height:");
  });

  it("hides the attachment bar while the keyboard is open", () => {
    const rule = cssRule(editorCss, ".editor-pane.keyboard-open .attachment-area");
    expect(rule).toContain("display: none");
  });

  it("caps inline images to a modest width instead of native size", () => {
    const imageRule = cssRule(editorCss, ".editor-body .tiptap img");
    expect(imageRule).toContain("max-width: min(480px, 100%)");
    expect(imageRule).toContain("height: auto");
  });

  // The title rows live inside the scroller, so the scroller must not inset
  // them: the note's text padding belongs to the content wrapper instead.
  it("scrolls the note inside a bare scroller and pads only its content", () => {
    const body = cssRule(editorCss, ".editor-body");
    expect(body).toContain("overflow-anchor: none");
    expect(body).toContain("overscroll-behavior: contain");
    expect(body).not.toContain("padding");
    expect(cssRule(editorCss, ".editor-content")).toContain("padding:");
  });
});
