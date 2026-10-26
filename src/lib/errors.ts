export function toMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : readMessage(error);

  if (!message) return "Something went wrong. Please try again.";
  if (/provider is not enabled/i.test(message)) {
    return "Google sign-in is not configured for this project yet.";
  }
  if (/rate limit|too many requests/i.test(message)) {
    return "Too many attempts. Wait a moment and try again.";
  }
  return message;
}

function readMessage(error: unknown): string {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return "";
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}
