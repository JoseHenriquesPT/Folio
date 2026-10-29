import { describe, expect, it } from "vitest";
import editorCss from "./editor.css?raw";
import indexHtml from "../../index.html?raw";

// Guards the mobile keyboard fix: the toolbar must keep its height when the
// on-screen keyboard shrinks the pane, and the viewport must resize the layout
// (not just the visual viewport) so the editor scrolls instead of squeezing.

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

  it("pins the formatting toolbar instead of letting it compress", () => {
    const rule = cssRule(editorCss, ".editor-toolbar");
    expect(rule).toContain("flex: 0 0 auto");
    expect(rule).toContain("min-height:");
  });

  it("keeps the header and meta rows from shrinking into the body", () => {
    expect(cssRule(editorCss, ".editor-header")).toContain("flex: 0 0 auto");
    expect(cssRule(editorCss, ".editor-meta-row")).toContain("flex: 0 0 auto");
  });

  it("caps inline images to a modest width instead of native size", () => {
    const imageRule = cssRule(editorCss, ".editor-body .tiptap img");
    expect(imageRule).toContain("max-width: min(480px, 100%)");
    expect(imageRule).toContain("height: auto");
  });

  it("hides the header rows while the note body is scrolled down", () => {
    expect(editorCss).toContain(
      ".editor-pane.header-collapsed .editor-header"
    );
    expect(editorCss).toContain(
      ".editor-pane.header-collapsed .editor-meta-row"
    );
  });
});
