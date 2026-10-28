import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDate,
  formatNoteCount,
  formatRelativeTime,
  noteTitle,
  snippet,
} from "./format";

describe("snippet", () => {
  it("collapses whitespace and trims", () => {
    expect(snippet("  Hello   world\n\nagain  ")).toBe("Hello world again");
  });

  it("truncates at the limit without cutting mid-word", () => {
    const text = "one two three four five six seven";
    expect(snippet(text, 15)).toBe("one two three…");
  });

  it("returns empty text unchanged", () => {
    expect(snippet("   ")).toBe("");
  });
});

describe("noteTitle", () => {
  it("falls back for an empty title", () => {
    expect(noteTitle("")).toBe("Untitled note");
    expect(noteTitle("   ")).toBe("Untitled note");
  });

  it("trims a real title", () => {
    expect(noteTitle("  Garden  ")).toBe("Garden");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-01-10T12:00:00Z");

  it("shows just now for recent timestamps", () => {
    expect(formatRelativeTime("2026-01-10T11:59:40Z", now)).toBe("just now");
  });

  it("shows minutes and hours", () => {
    expect(formatRelativeTime("2026-01-10T11:45:00Z", now)).toBe("15 min ago");
    expect(formatRelativeTime("2026-01-10T09:00:00Z", now)).toBe("3 h ago");
  });

  it("shows days for the last week", () => {
    expect(formatRelativeTime("2026-01-08T12:00:00Z", now)).toBe("2 d ago");
  });

  it("shows a date after a week", () => {
    expect(formatRelativeTime("2025-12-25T12:00:00Z", now)).toBe("Dec 25, 2025");
  });
});

describe("formatDate", () => {
  it("formats a stable English date", () => {
    expect(formatDate("2026-01-02T12:00:00Z")).toBe("Jan 2, 2026");
  });
});

describe("formatNoteCount", () => {
  it("singular and plural", () => {
    expect(formatNoteCount(1)).toBe("1 note");
    expect(formatNoteCount(0)).toBe("0 notes");
    expect(formatNoteCount(12)).toBe("12 notes");
  });
});

describe("formatCount", () => {
  it("pluralises with an s by default", () => {
    expect(formatCount(0, "attachment")).toBe("0 attachments");
    expect(formatCount(1, "attachment")).toBe("1 attachment");
    expect(formatCount(12, "attachment")).toBe("12 attachments");
  });

  it("takes an irregular plural", () => {
    expect(formatCount(1, "skipped item")).toBe("1 skipped item");
    expect(formatCount(2, "skipped item", "skipped items")).toBe("2 skipped items");
  });
});
