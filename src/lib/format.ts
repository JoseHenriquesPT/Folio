const FALLBACK_TITLE = "Untitled note";

export function snippet(text: string, limit = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;

  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  const shouldTrim = lastSpace > Math.floor(limit * 0.5);
  return `${(shouldTrim ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function noteTitle(title: string): string {
  return title.trim() || FALLBACK_TITLE;
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)} d ago`;

  return formatDate(iso);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatCount(
  count: number,
  one: string,
  many = `${one}s`
): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatNoteCount(count: number): string {
  return formatCount(count, "note");
}
