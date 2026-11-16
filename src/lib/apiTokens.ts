/** Mirrors the api_tokens_name_length check in 0016_api_tokens.sql. */
export const TOKEN_NAME_MAX = 80;

export type ApiTokenScope = "read" | "write";
export type ApiTokenStatus = "active" | "expired" | "revoked";

export const TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;
export type TokenExpiryDays = (typeof TOKEN_EXPIRY_DAYS)[number];

export const TOKEN_EXPIRY_LABELS: Record<TokenExpiryDays, string> = {
  30: "30 days",
  90: "90 days",
  365: "1 year",
};

export function validateTokenName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the token a name.";
  if (trimmed.length > TOKEN_NAME_MAX) {
    return `Keep the name under ${TOKEN_NAME_MAX} characters.`;
  }
  return null;
}

export function tokenExpiryDate(
  days: TokenExpiryDays,
  now = new Date()
): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function scopeLabel(scope: ApiTokenScope): string {
  return scope === "write" ? "Read and write" : "Read only";
}

export function scopeDescription(scope: ApiTokenScope): string {
  return scope === "write"
    ? "Can search, read, create, edit, move and tag notes, and rename notebooks."
    : "Can search and read notes, but cannot change anything.";
}

export function tokenStatus(
  token: { expiresAt: string; revokedAt: string | null },
  now = new Date()
): ApiTokenStatus {
  if (token.revokedAt) return "revoked";
  if (new Date(token.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

export function statusLabel(status: ApiTokenStatus): string {
  switch (status) {
    case "revoked":
      return "Revoked";
    case "expired":
      return "Expired";
    default:
      return "Active";
  }
}

export function tokenPrefixLabel(prefix: string): string {
  return `${prefix}…`;
}
