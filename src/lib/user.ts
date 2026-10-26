import type { Session } from "@supabase/supabase-js";

export function displayName(session: Session): string {
  const metadata = session.user.user_metadata as Record<string, unknown>;
  for (const candidate of [metadata.full_name, metadata.name]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return session.user.email ?? "Your account";
}

export function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
