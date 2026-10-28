import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_REF_PREFIX,
  MAX_ATTACHMENT_BYTES,
  attachmentIdFromRef,
  attachmentRef,
  attachmentRejection,
  formatBytes,
  isInlineImage,
  nextAttachmentSrc,
  resolveAttachmentRefs,
  restoreAttachmentRefs,
  signedUrlRefreshDelay,
  stripAttachmentRefs,
} from "./attachments";

const ID = "eeeeeeee-0000-4000-8000-000000000001";
const URL = `https://example.test/storage/v1/object/sign/note-attachments/${ID}.png?token=abc`;
const OTHER_URL = "https://example.test/photo.jpg";

describe("attachment refs", () => {
  it("builds and parses an attachment ref", () => {
    expect(attachmentRef(ID)).toBe(`${ATTACHMENT_REF_PREFIX}${ID}`);
    expect(attachmentIdFromRef(`${ATTACHMENT_REF_PREFIX}${ID}`)).toBe(ID);
  });

  it("ignores values that are not refs", () => {
    expect(attachmentIdFromRef("https://example.test/a.png")).toBeNull();
    expect(attachmentIdFromRef("attachment:")).toBeNull();
  });
});

describe("attachment validation", () => {
  it("treats raster images as inline media", () => {
    expect(isInlineImage("image/png")).toBe(true);
    expect(isInlineImage("image/JPEG")).toBe(true);
    expect(isInlineImage("image/svg+xml")).toBe(false);
    expect(isInlineImage("application/pdf")).toBe(false);
  });

  it("accepts a normal file", () => {
    expect(
      attachmentRejection({ name: "photo.png", type: "image/png", size: 2048 })
    ).toBeNull();
  });

  it("rejects files over the size limit with a readable message", () => {
    expect(
      attachmentRejection({
        name: "huge.zip",
        type: "application/zip",
        size: MAX_ATTACHMENT_BYTES + 1,
      })
    ).toBe("huge.zip is larger than the 20 MB limit.");
  });

  it("rejects empty and unnamed files", () => {
    expect(
      attachmentRejection({ name: "empty.txt", type: "text/plain", size: 0 })
    ).toBe("empty.txt is empty.");
    expect(
      attachmentRejection({ name: "  ", type: "text/plain", size: 4 })
    ).toBe("A file needs a name.");
  });

  it("rejects formats that execute when opened", () => {
    expect(
      attachmentRejection({ name: "logo.svg", type: "image/svg+xml", size: 12 })
    ).toBe("logo.svg cannot be stored. Use a PNG, JPEG, or another safe format.");
    expect(
      attachmentRejection({ name: "page.html", type: "text/html", size: 12 })
    ).not.toBeNull();
  });
});

describe("formatBytes", () => {
  it("formats small and large sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
  });
});

describe("signedUrlRefreshDelay", () => {
  it("refreshes five minutes before a one-hour expiry", () => {
    expect(signedUrlRefreshDelay(3600)).toBe(55 * 60 * 1000);
  });

  it("never waits less than thirty seconds", () => {
    expect(signedUrlRefreshDelay(10)).toBe(30 * 1000);
    expect(signedUrlRefreshDelay(0)).toBe(30 * 1000);
  });
});

describe("attachment HTML rewriting", () => {
  it("resolves refs in image sources and links", () => {
    const html =
      `<p><img src="${attachmentRef(ID)}" alt="Photo"></p>` +
      `<p><a href="${attachmentRef(ID)}">Download</a></p>`;

    expect(resolveAttachmentRefs(html, { [ID]: URL })).toBe(
      `<p><img src="${URL}" alt="Photo"></p>` +
        `<p><a href="${URL}">Download</a></p>`
    );
  });

  it("leaves unknown refs and external links alone", () => {
    const html = `<img src="${attachmentRef(ID)}"><img src="${OTHER_URL}">`;
    expect(resolveAttachmentRefs(html, {})).toBe(html);
  });

  it("restores signed URLs to refs before saving", () => {
    const html = `<img src="${URL}" alt="Photo"><a href="https://example.com">x</a>`;
    expect(restoreAttachmentRefs(html, { [ID]: URL })).toBe(
      `<img src="${attachmentRef(ID)}" alt="Photo"><a href="https://example.com">x</a>`
    );
  });

  it("matches URLs whose ampersands were escaped in HTML", () => {
    const withQuery = `${URL}&download=photo`;
    expect(
      restoreAttachmentRefs(
        `<img src="${withQuery.replace(/&/g, "&amp;")}">`,
        { [ID]: withQuery }
      )
    ).toBe(`<img src="${attachmentRef(ID)}">`);
  });

  it("round-trips a ref through a signed URL", () => {
    const html = `<p><img src="${attachmentRef(ID)}"></p>`;
    const resolved = resolveAttachmentRefs(html, { [ID]: URL });
    expect(restoreAttachmentRefs(resolved, { [ID]: URL })).toBe(html);
  });
});

describe("nextAttachmentSrc", () => {
  const NEW_URL = `${URL}&fresh=1`;

  it("resolves a ref to its signed URL", () => {
    expect(nextAttachmentSrc(attachmentRef(ID), { [ID]: URL })).toBe(URL);
  });

  it("swaps an earlier signed URL for a fresh one", () => {
    expect(
      nextAttachmentSrc(URL, { [ID]: NEW_URL }, { [ID]: URL })
    ).toBe(NEW_URL);
  });

  it("ignores URLs it never signed", () => {
    expect(nextAttachmentSrc(OTHER_URL, { [ID]: URL })).toBeNull();
  });
});

describe("stripAttachmentRefs", () => {
  it("removes the image and keeps neighbouring content", () => {
    expect(
      stripAttachmentRefs(
        `<p>Before</p><img src="${attachmentRef(ID)}"><p>After</p>`,
        ID
      )
    ).toBe("<p>Before</p><p>After</p>");
  });

  it("unwraps a link to the file but keeps its text", () => {
    expect(
      stripAttachmentRefs(
        `<p><a href="${attachmentRef(ID)}">Report</a></p>`,
        ID
      )
    ).toBe("<p>Report</p>");
  });

  it("leaves other attachments untouched", () => {
    const other = "eeeeeeee-0000-4000-8000-000000000002";
    const html = `<img src="${attachmentRef(other)}">`;
    expect(stripAttachmentRefs(html, ID)).toBe(html);
  });

  it("removes an image the editor currently holds as a signed URL", () => {
    const signed = resolveAttachmentRefs(`<img src="${attachmentRef(ID)}">`, {
      [ID]: URL,
    });
    expect(
      stripAttachmentRefs(restoreAttachmentRefs(signed, { [ID]: URL }), ID)
    ).toBe("");
  });
});
