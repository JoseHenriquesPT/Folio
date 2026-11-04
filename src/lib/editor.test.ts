import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "./editor";

let editor: Editor | null = null;

const TASK_LIST_HTML =
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li></ul>';

function roundTrip(html: string): string {
  editor = new Editor({ extensions: editorExtensions, content: html });
  return editor.getHTML();
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("editor HTML round-trip", () => {
  it("keeps headings, paragraphs, and inline formatting", () => {
    const html = roundTrip(
      "<h1>Title</h1><p><strong>Bold</strong> and <em>italic</em></p>"
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("keeps bullet and ordered lists", () => {
    const html = roundTrip(
      "<ul><li><p>One</p></li></ul><ol><li><p>Two</p></li></ol>"
    );
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li><p>One</p></li>");
  });

  it("keeps task lists and checked state", () => {
    const html = roundTrip(TASK_LIST_HTML);
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="true"');
  });

  // The live editor DOM is built by TipTap's node view, not by renderHTML, so
  // it must be asserted separately: styles and paste parsing key on the same
  // attributes the serialized HTML carries.
  it("stamps task items with data-type in the live editor DOM", () => {
    editor = new Editor({
      extensions: editorExtensions,
      content: TASK_LIST_HTML,
    });
    const item = editor.view.dom.querySelector("ul[data-type='taskList'] > li");
    expect(item).not.toBeNull();
    expect(item?.getAttribute("data-type")).toBe("taskItem");
    expect(item?.getAttribute("data-checked")).toBe("true");
    expect(item?.querySelector("label")).not.toBeNull();
    expect(item?.querySelector("div")).not.toBeNull();
  });

  it("keeps code blocks and inline code", () => {
    const html = roundTrip(
      "<pre><code>const answer = 42;</code></pre><p>Use <code>npm</code></p>"
    );
    expect(html).toContain("<pre><code>const answer = 42;</code></pre>");
    expect(html).toContain("<code>npm</code>");
  });

  it("keeps tables with header cells", () => {
    const html = roundTrip(
      "<table><tbody><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></tbody></table>"
    );
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("Name");
  });

  it("keeps links", () => {
    const html = roundTrip(
      '<p><a href="https://example.com">Example</a></p>'
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("Example");
  });

  it("keeps images", () => {
    const html = roundTrip(
      '<p><img src="https://example.com/photo.png" alt="Photo"></p>'
    );
    expect(html).toContain('src="https://example.com/photo.png"');
    expect(html).toContain('alt="Photo"');
  });
});
