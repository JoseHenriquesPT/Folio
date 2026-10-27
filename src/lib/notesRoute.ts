const NEW_NOTE_DROP = [
  "view",
  "tag",
  "q",
  "code",
  "error",
  "error_code",
  "error_description",
];

export function newNoteSearch(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of NEW_NOTE_DROP) params.delete(key);
  const next = params.toString();
  return next ? `?${next}` : "";
}
