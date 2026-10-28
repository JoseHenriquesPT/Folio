export type SharePermission = "read" | "edit";

export type ShareRole = "owner" | "editor" | "reader" | "stranger";

export interface ShareRecipient {
  shareId: string;
  userId: string;
  displayName: string;
  permission: SharePermission;
}

export type ShareAction =
  | { type: "load"; recipients: ShareRecipient[] }
  | { type: "add"; recipient: ShareRecipient }
  | { type: "update"; shareId: string; permission: SharePermission }
  | { type: "revoke"; shareId: string };

export function reduceShares(
  state: ShareRecipient[],
  action: ShareAction
): ShareRecipient[] {
  switch (action.type) {
    case "load":
      return action.recipients;
    case "add": {
      const existing = state.findIndex(
        (recipient) =>
          recipient.shareId === action.recipient.shareId ||
          recipient.userId === action.recipient.userId
      );
      if (existing === -1) return [...state, action.recipient];
      return state.map((recipient, index) =>
        index === existing ? action.recipient : recipient
      );
    }
    case "update":
      return state.map((recipient) =>
        recipient.shareId === action.shareId
          ? { ...recipient, permission: action.permission }
          : recipient
      );
    case "revoke":
      return state.filter((recipient) => recipient.shareId !== action.shareId);
  }
}

export function permissionLabel(permission: SharePermission | null): string {
  if (permission === "edit") return "Can edit";
  if (permission === "read") return "Read only";
  return "No access";
}

export function ownerShareBadge(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "Shared" : `Shared · ${count}`;
}

export function shareRole(
  ownerId: string,
  userId: string,
  permission: SharePermission | null
): ShareRole {
  if (userId === ownerId) return "owner";
  if (permission === "edit") return "editor";
  if (permission === "read") return "reader";
  return "stranger";
}

export function canEditNote(role: ShareRole): boolean {
  return role === "owner" || role === "editor";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface ShareTargetInput {
  email: string;
  targetId: string | null;
  ownerId: string;
  currentUserId: string;
}

export function validateShareTarget(input: ShareTargetInput): string | null {
  if (!input.email.trim()) return "Enter an email address.";
  if (!input.targetId) return "No account uses that email.";
  if (input.targetId === input.ownerId) return "You already own this note.";
  if (input.targetId === input.currentUserId) {
    return "You cannot share a note with yourself.";
  }
  return null;
}
