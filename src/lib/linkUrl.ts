/** What the user asked for in the link prompt. */
export type LinkChoice =
  | { action: "cancel" }
  | { action: "clear" }
  | { action: "set"; href: string };

/** Bare input like `example.com` becomes https; schemes and relative paths stay. */
export function normalizeHref(value: string): string {
  return /^(https?:|mailto:|#|\/)/i.test(value) ? value : `https://${value}`;
}

/**
 * Turns the prompt's raw result into an action. `null` means the dialog was
 * dismissed, whitespace means "no link", and anything else is a URL.
 */
export function decideLinkChoice(input: string | null): LinkChoice {
  if (input === null) return { action: "cancel" };

  const value = input.trim();
  if (!value) return { action: "clear" };

  return { action: "set", href: normalizeHref(value) };
}
