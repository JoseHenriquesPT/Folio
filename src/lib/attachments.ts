export const ATTACHMENT_REF_PREFIX = "attachment:";
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const SIGNED_URL_SECONDS = 60 * 60;

const INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

// These types can execute script when opened straight from the signed URL.
const BLOCKED_MIME_TYPES = new Set([
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
]);

export interface AttachmentCandidate {
  name: string;
  type: string;
  size: number;
}

export function attachmentRef(attachmentId: string): string {
  return `${ATTACHMENT_REF_PREFIX}${attachmentId}`;
}

export function attachmentIdFromRef(value: string): string | null {
  if (!value.startsWith(ATTACHMENT_REF_PREFIX)) return null;
  const id = value.slice(ATTACHMENT_REF_PREFIX.length).trim();
  return id || null;
}

export function isInlineImage(mimeType: string): boolean {
  return INLINE_IMAGE_TYPES.has(mimeType.toLowerCase());
}

export function attachmentRejection(
  file: AttachmentCandidate,
  limitBytes = MAX_ATTACHMENT_BYTES
): string | null {
  const name = file.name.trim() || "This file";

  if (!file.name.trim()) return "A file needs a name.";
  if (file.size <= 0) return `${name} is empty.`;
  if (file.size > limitBytes) {
    return `${name} is larger than the ${formatBytes(limitBytes)} limit.`;
  }
  if (BLOCKED_MIME_TYPES.has(file.type.toLowerCase())) {
    return `${name} cannot be stored. Use a PNG, JPEG, or another safe format.`;
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/**
 * Sign URLs again a few minutes before they expire, but never sooner than
 * half a minute from now.
 */
export function signedUrlRefreshDelay(
  expiresInSeconds = SIGNED_URL_SECONDS
): number {
  const lifetime = Math.max(0, expiresInSeconds) * 1000;
  const lead = Math.min(5 * 60 * 1000, lifetime / 2);
  return Math.max(30 * 1000, lifetime - lead);
}

const URL_ATTRIBUTE = /(\s(?:src|href)=")([^"]*)(")/gi;

function decodeAttribute(value: string): string {
  return value.replace(/&amp;/g, "&");
}

function rewriteUrlAttributes(
  html: string,
  rewrite: (value: string) => string | null
): string {
  return html.replace(URL_ATTRIBUTE, (match, prefix, value, suffix) => {
    const next = rewrite(value);
    return next === null ? match : `${prefix}${next}${suffix}`;
  });
}

/** Replace `attachment:<id>` refs with signed URLs for display. */
export function resolveAttachmentRefs(
  html: string,
  urls: Record<string, string>
): string {
  return rewriteUrlAttributes(html, (value) => {
    const id = attachmentIdFromRef(decodeAttribute(value));
    if (!id) return null;
    return urls[id] ?? null;
  });
}

function urlToAttachmentId(urls: Record<string, string>): Map<string, string> {
  const byUrl = new Map<string, string>();
  for (const [id, url] of Object.entries(urls)) byUrl.set(url, id);
  return byUrl;
}

/** Replace known signed URLs with `attachment:<id>` refs before saving. */
export function restoreAttachmentRefs(
  html: string,
  urls: Record<string, string>
): string {
  const byUrl = urlToAttachmentId(urls);

  return rewriteUrlAttributes(html, (value) => {
    const id = byUrl.get(decodeAttribute(value));
    return id ? attachmentRef(id) : null;
  });
}

/**
 * The freshest signed URL for an image node. Accepts a ref or a URL signed in a
 * previous round, so re-signing can swap sources without touching the note.
 */
export function nextAttachmentSrc(
  current: string,
  urls: Record<string, string>,
  previousUrls: Record<string, string> = {}
): string | null {
  const id =
    attachmentIdFromRef(current) ??
    urlToAttachmentId(previousUrls).get(current) ??
    urlToAttachmentId(urls).get(current);

  if (!id) return null;
  return urls[id] ?? null;
}

/**
 * Removes one attachment from note HTML: images disappear, links to the file
 * keep their text so no prose is lost.
 */
export function stripAttachmentRefs(
  html: string,
  attachmentId: string
): string {
  const ref = attachmentRef(attachmentId);

  const withoutImages = html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.includes(`src="${ref}"`) ? "" : tag
  );

  return withoutImages.replace(
    /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (tag, href: string, text: string) =>
      decodeAttribute(href) === ref ? text : tag
  );
}
