export interface NoteDraft {
  noteId: string;
  title: string;
  bodyHtml: string;
  version: number;
  savedAt: string;
}

const PREFIX = "folio.draft";

export function draftKey(userId: string, noteId: string): string {
  return `${PREFIX}.${userId}.${noteId}`;
}

export function readDraft(
  storage: Storage,
  userId: string,
  noteId: string
): NoteDraft | null {
  const raw = storage.getItem(draftKey(userId, noteId));
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<NoteDraft>;
    if (
      typeof value.noteId !== "string" ||
      typeof value.title !== "string" ||
      typeof value.bodyHtml !== "string" ||
      typeof value.version !== "number" ||
      typeof value.savedAt !== "string"
    ) {
      return null;
    }
    return {
      noteId: value.noteId,
      title: value.title,
      bodyHtml: value.bodyHtml,
      version: value.version,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

export function writeDraft(storage: Storage, userId: string, draft: NoteDraft): void {
  storage.setItem(draftKey(userId, draft.noteId), JSON.stringify(draft));
}

export function clearDraft(
  storage: Storage,
  userId: string,
  noteId: string
): void {
  storage.removeItem(draftKey(userId, noteId));
}
