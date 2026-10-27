import { describe, expect, it } from "vitest";
import { clearDraft, draftKey, readDraft, writeDraft, type NoteDraft } from "./drafts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function draft(overrides: Partial<NoteDraft> = {}): NoteDraft {
  return {
    noteId: "note-1",
    title: "Draft",
    bodyHtml: "<p>Work in progress</p>",
    version: 3,
    savedAt: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

describe("drafts", () => {
  it("namespaces drafts by user and note", () => {
    expect(draftKey("user-1", "note-1")).toBe("folio.draft.user-1.note-1");
    expect(draftKey("user-2", "note-1")).not.toBe(draftKey("user-1", "note-1"));
  });

  it("writes and reads a draft", () => {
    const storage = new MemoryStorage();

    writeDraft(storage, "user-1", draft());

    expect(readDraft(storage, "user-1", "note-1")).toEqual(draft());
  });

  it("returns null when there is no draft", () => {
    const storage = new MemoryStorage();
    expect(readDraft(storage, "user-1", "note-1")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem(draftKey("user-1", "note-1"), "{not json");

    expect(readDraft(storage, "user-1", "note-1")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      draftKey("user-1", "note-1"),
      JSON.stringify({ noteId: "note-1", title: "Only a title" })
    );

    expect(readDraft(storage, "user-1", "note-1")).toBeNull();
  });

  it("clears only the requested draft", () => {
    const storage = new MemoryStorage();
    writeDraft(storage, "user-1", draft());
    writeDraft(storage, "user-1", draft({ noteId: "note-2" }));

    clearDraft(storage, "user-1", "note-1");

    expect(readDraft(storage, "user-1", "note-1")).toBeNull();
    expect(readDraft(storage, "user-1", "note-2")).toEqual(
      draft({ noteId: "note-2" })
    );
  });
});
