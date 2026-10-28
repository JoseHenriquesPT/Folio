import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownToHtml } from "./markdown";

describe("htmlToMarkdown", () => {
  it("converts paragraphs and inline formatting", () => {
    const markdown = htmlToMarkdown(
      "<p>Hello <strong>world</strong>, <em>this</em> is <s>old</s> and <code>inline()</code>.</p>"
    );

    expect(markdown).toBe(
      "Hello **world**, *this* is ~~old~~ and `inline()`.\n"
    );
  });

  it("converts headings, quotes, and rules", () => {
    expect(htmlToMarkdown("<h2>Title</h2>")).toBe("## Title\n");
    expect(htmlToMarkdown("<blockquote><p>Quoted</p></blockquote>")).toBe(
      "> Quoted\n"
    );
    expect(htmlToMarkdown("<hr>")).toBe("---\n");
  });

  it("converts lists with two-space nesting", () => {
    const markdown = htmlToMarkdown(
      "<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul>"
    );

    expect(markdown).toBe("- one\n  - two\n");
  });

  it("converts TipTap task items", () => {
    const markdown = htmlToMarkdown(
      [
        '<ul data-type="taskList">',
        '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li>',
        '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li>',
        "</ul>",
      ].join("")
    );

    expect(markdown).toBe("- [x] done\n- [ ] todo\n");
  });

  it("converts fenced code with a language", () => {
    const markdown = htmlToMarkdown(
      '<pre><code class="language-js">const a = 1;\n</code></pre>'
    );

    expect(markdown).toBe("```js\nconst a = 1;\n```\n");
  });

  it("converts links with titles", () => {
    const markdown = htmlToMarkdown(
      '<p><a href="https://example.test/a" title="Example">label</a></p>'
    );

    expect(markdown).toBe('[label](https://example.test/a "Example")\n');
  });

  it("converts tables to GitHub flavoured Markdown", () => {
    const markdown = htmlToMarkdown(
      [
        "<table><thead><tr><th>Name</th><th>Count</th></tr></thead>",
        "<tbody><tr><td>one</td><td>1</td></tr></tbody></table>",
      ].join("")
    );

    expect(markdown).toContain("| Name | Count |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("| one | 1 |");
  });

  it("resolves attachment refs through the caller", () => {
    const markdown = htmlToMarkdown(
      '<p><img src="attachment:abc" alt="shot"></p>',
      {
        resolveImage: (src) =>
          src === "attachment:abc" ? "attachments/note-1/shot.png" : null,
      }
    );

    expect(markdown).toBe("![shot](attachments/note-1/shot.png)\n");
  });

  it("keeps external images and drops empty sources", () => {
    expect(
      htmlToMarkdown('<p><img src="https://example.test/a.png" alt=""></p>')
    ).toBe("![](https://example.test/a.png)\n");

    expect(htmlToMarkdown('<p><img src="" alt="x"></p>')).toBe("");
  });

  it("trims trailing spaces and ends with one newline", () => {
    expect(htmlToMarkdown("<p>a</p><p>b</p>")).toBe("a\n\nb\n");
    expect(htmlToMarkdown("<p></p><p></p>")).toBe("");
    expect(htmlToMarkdown("   ")).toBe("");
  });
});

describe("markdownToHtml", () => {
  it("renders headings, emphasis, links, and images", () => {
    const html = markdownToHtml(
      "# Title\n\n**bold** and [link](https://example.test)\n\n![alt](attachment:abc)"
    );

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://example.test">link</a>');
    expect(html).toContain('<img src="attachment:abc" alt="alt">');
  });

  it("renders GitHub flavoured tables", () => {
    const html = markdownToHtml("| a | b |\n| --- | --- |\n| 1 | 2 |");

    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders fenced code with a language class", () => {
    const html = markdownToHtml("```js\nconst a = 1;\n```");

    expect(html).toContain('<code class="language-js">');
  });

  it("turns task lists into the editor's task item shape", () => {
    const html = markdownToHtml("- [x] done\n- [ ] todo\n");

    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-type="taskItem" data-checked="true"');
    expect(html).toContain('data-type="taskItem" data-checked="false"');
    expect(html).toContain("<p>done</p>");
    expect(html).not.toContain("<input");
  });

  it("leaves plain bullet lists alone", () => {
    const html = markdownToHtml("- one\n- two\n");

    expect(html).toContain("<ul>");
    expect(html).not.toContain("taskList");
  });
});
