import { describe, expect, it } from "vitest";
import { formatFrontMatter, parseFrontMatter } from "./frontmatter";

describe("formatFrontMatter", () => {
  it("writes the documented keys", () => {
    const yaml = formatFrontMatter({
      title: "Card Games",
      notebook: "Ideas",
      tags: ["games", "family"],
      created: "2026-09-07T18:59:22.990Z",
      updated: "2026-09-07T19:00:16.462Z",
    });

    expect(yaml).toBe(
      [
        "---",
        "title: Card Games",
        'notebook: Ideas',
        'tags: ["games", "family"]',
        'created: "2026-09-07T18:59:22.990Z"',
        'updated: "2026-09-07T19:00:16.462Z"',
        "---",
        "",
      ].join("\n")
    );
  });

  it("quotes values that YAML would otherwise misread", () => {
    const yaml = formatFrontMatter({
      title: 'Deploy: "prod" #2',
      tags: [],
      created: null,
      updated: null,
    });

    expect(yaml).toContain('title: "Deploy: \\"prod\\" #2"');
    expect(yaml).toContain("tags: []");
    expect(yaml).toContain("created: null");
  });

  it("omits notebook when the note is unfiled and archived when false", () => {
    const yaml = formatFrontMatter({
      title: "Loose",
      tags: [],
      created: null,
      updated: null,
      archived: false,
    });

    expect(yaml).not.toContain("notebook:");
    expect(yaml).not.toContain("archived:");
  });

  it("includes archived when the note is archived", () => {
    const yaml = formatFrontMatter({
      title: "Old",
      tags: [],
      created: null,
      updated: null,
      archived: true,
    });

    expect(yaml).toContain("archived: true");
  });
});

describe("parseFrontMatter", () => {
  it("round-trips what formatFrontMatter writes", () => {
    const document = `${formatFrontMatter({
      title: 'Deploy: "prod" #2',
      notebook: "Projects",
      tags: ["ops", "release notes"],
      created: "2026-01-02T03:04:05.000Z",
      updated: "2026-02-03T04:05:06.000Z",
      archived: true,
    })}\nBody text.\n`;

    const parsed = parseFrontMatter(document);

    expect(parsed.data).toEqual({
      title: 'Deploy: "prod" #2',
      notebook: "Projects",
      tags: ["ops", "release notes"],
      created: "2026-01-02T03:04:05.000Z",
      updated: "2026-02-03T04:05:06.000Z",
      archived: true,
    });
    expect(parsed.body).toBe("Body text.\n");
  });

  it("reads block style tag lists", () => {
    const parsed = parseFrontMatter(
      "---\ntitle: Note\ntags:\n  - alpha\n  - beta\ncreated: 2026-01-01\n---\nBody\n"
    );

    expect(parsed.data.tags).toEqual(["alpha", "beta"]);
    expect(parsed.data.created).toBe("2026-01-01");
  });

  it("reads single quoted and bare values", () => {
    const parsed = parseFrontMatter(
      "---\ntitle: 'It''s here'\nnotebook: Ideas\nempty:\n---\nBody\n"
    );

    expect(parsed.data.title).toBe("It's here");
    expect(parsed.data.notebook).toBe("Ideas");
    expect(parsed.data.empty).toBeNull();
  });

  it("returns the whole document when there is no front matter", () => {
    const parsed = parseFrontMatter("# Heading\n\nBody\n");

    expect(parsed.data).toEqual({});
    expect(parsed.body).toBe("# Heading\n\nBody\n");
  });

  it("treats an unterminated block as body", () => {
    const document = "---\ntitle: Broken\n\nBody\n";

    const parsed = parseFrontMatter(document);

    expect(parsed.data).toEqual({});
    expect(parsed.body).toBe(document);
  });

  it("handles Windows line endings", () => {
    const parsed = parseFrontMatter(
      "---\r\ntitle: Note\r\ntags: [a]\r\n---\r\nBody\r\n"
    );

    expect(parsed.data.title).toBe("Note");
    expect(parsed.data.tags).toEqual(["a"]);
    expect(parsed.body).toBe("Body\r\n");
  });
});
