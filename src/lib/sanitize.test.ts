import { describe, expect, it } from "vitest";
import { htmlToPlainText, sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("keeps normal note markup", () => {
    const html = "<h1>Title</h1><p><strong>Bold</strong> and <em>italic</em></p>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("keeps task list attributes", () => {
    const html =
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li></ul>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("strips scripts and event handlers", () => {
    const html =
      '<p onclick="steal()">Safe</p><script>alert(1)</script><img src="x" onerror="steal()">';
    const clean = sanitizeHtml(html);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick|onerror/i);
    expect(clean).toContain("Safe");
  });

  it("strips javascript links", () => {
    const clean = sanitizeHtml('<a href="javascript:alert(1)">Bad</a>');
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("keeps attachment refs in images and links", () => {
    const html =
      '<img src="attachment:eeeeeeee-0000-4000-8000-000000000001">' +
      '<a href="attachment:eeeeeeee-0000-4000-8000-000000000001">File</a>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('src="attachment:eeeeeeee-0000-4000-8000-000000000001"');
    expect(clean).toContain('href="attachment:eeeeeeee-0000-4000-8000-000000000001"');
  });

  it("keeps safe links and table markup", () => {
    const html =
      '<a href="https://example.com">Site</a><table><tbody><tr><td>A</td></tr></tbody></table>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain("<table>");
    expect(clean).toContain("<td>A</td>");
  });

  it("removes style attributes", () => {
    const clean = sanitizeHtml('<p style="position:fixed">Text</p>');
    expect(clean).toBe("<p>Text</p>");
  });
});

describe("htmlToPlainText", () => {
  it("extracts readable text", () => {
    expect(htmlToPlainText("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world"
    );
  });

  it("collapses whitespace and strips scripts", () => {
    expect(htmlToPlainText("<p>A</p><p>B</p><script>x()</script>")).toBe("A B");
  });
});
