import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../../src/lib/markdown";
import { markdownToSafeHtml } from "./markdown";

// Runs in the Node project: the browser DOMParser must not be needed for the
// HTML <-> Markdown paths used by the MCP tools.
describe("MCP Markdown conversion", () => {
  it("converts stored HTML without a browser DOM", () => {
    const markdown = htmlToMarkdown(
      "<h1>Trip</h1><p>Pack <strong>light</strong>.</p>"
    );

    expect(markdown).toContain("# Trip");
    expect(markdown).toContain("**light**");
  });

  it("keeps task-item checkboxes", () => {
    const markdown = htmlToMarkdown(
      '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="true"><p>Done</p></li>' +
        '<li data-type="taskItem" data-checked="false"><p>Todo</p></li>' +
        "</ul>"
    );

    expect(markdown).toContain("- [x] Done");
    expect(markdown).toContain("- [ ] Todo");
  });

  it("converts Markdown to the editor's task-list shape", () => {
    const html = markdownToSafeHtml("- [x] Done\n- [ ] Todo");

    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
  });

  it("strips scripts and event handlers", () => {
    const html = markdownToSafeHtml(
      '<script>alert(1)</script><p>Hello</p>' +
        '<img src="https://example.com/x.png" onerror="alert(1)">'
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).toContain("<p>Hello</p>");
  });

  it("strips javascript links but keeps attachment images", () => {
    const html = markdownToSafeHtml(
      "[bad](javascript:alert(1)) ![photo](attachment:abc)"
    );

    expect(html).not.toContain("javascript:");
    expect(html).toContain('src="attachment:abc"');
  });
});
