export type SearchPlan =
  | { kind: "fts"; term: string }
  | { kind: "like"; pattern: string }
  | null;

export const SHORT_SEARCH_LENGTH = 3;

export function sanitizeShortTerm(term: string): string {
  return term
    .replace(/[%_\\]/g, "")
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function planSearch(raw: string | undefined): SearchPlan {
  const term = raw?.trim() ?? "";
  if (!term) return null;

  if (term.length >= SHORT_SEARCH_LENGTH) {
    return { kind: "fts", term };
  }

  const cleaned = sanitizeShortTerm(term);
  return cleaned ? { kind: "like", pattern: `%${cleaned}%` } : null;
}
