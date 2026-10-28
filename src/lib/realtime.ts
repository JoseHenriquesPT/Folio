export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export type NoteChangeDecision =
  | "ignore"
  | "refresh"
  | "warn"
  | "removed";

export interface NoteChangeInput {
  eventType: RealtimeEventType;
  noteId: string;
  currentNoteId: string | null;
  currentVersion: number;
  incomingVersion?: number | null;
  dirty: boolean;
  saving: boolean;
  selfUserId: string;
  lastEditedBy?: string | null;
}

export function decideNoteChange(input: NoteChangeInput): NoteChangeDecision {
  if (!input.currentNoteId || input.noteId !== input.currentNoteId) {
    return "ignore";
  }

  if (input.eventType === "DELETE") return "removed";

  if (input.lastEditedBy === input.selfUserId && input.saving) {
    return "ignore";
  }

  if (
    input.incomingVersion !== null &&
    input.incomingVersion !== undefined &&
    input.incomingVersion <= input.currentVersion
  ) {
    return "ignore";
  }

  if (input.dirty || input.saving) return "warn";
  return "refresh";
}

export type ShareChangeDecision =
  | "ignore"
  | "check-access"
  | "permission"
  | "shares";

export interface ShareChangeInput {
  eventType: RealtimeEventType;
  noteId: string;
  currentNoteId: string | null;
  sharedWith: string;
  userId: string;
  isOwner: boolean;
}

export function decideShareChange(
  input: ShareChangeInput
): ShareChangeDecision {
  if (!input.currentNoteId || input.noteId !== input.currentNoteId) {
    return "ignore";
  }

  // Realtime only sends the primary key on delete, so the payload cannot say
  // whose share went away. The recipient re-reads their own share instead.
  if (input.eventType === "DELETE") {
    return input.isOwner ? "shares" : "check-access";
  }

  if (input.sharedWith === input.userId) return "permission";

  return input.isOwner ? "shares" : "ignore";
}

export function shouldRefreshList(
  eventType: RealtimeEventType,
  lastEditedBy: string | null | undefined,
  userId: string
): boolean {
  return !(eventType === "UPDATE" && lastEditedBy === userId);
}
