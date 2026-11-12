export type ImportFormat = "joplin" | "folio-vault" | "folio-json";

const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function hasTarMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 262) return false;

  for (let index = 0; index < 5; index += 1) {
    if (bytes[257 + index] !== "ustar".charCodeAt(index)) return false;
  }
  return true;
}

function looksLikeJson(bytes: Uint8Array): boolean {
  let index = 0;

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    index = 3;
  }

  while (index < bytes.length) {
    const byte = bytes[index];
    const whitespace =
      byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
    if (!whitespace) break;
    index += 1;
  }

  return bytes[index] === 0x7b;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

function formatForExtension(fileName: string): ImportFormat | null {
  switch (extensionOf(fileName)) {
    case "json":
      return "folio-json";
    case "zip":
      return "folio-vault";
    case "jex":
      return "joplin";
    default:
      return null;
  }
}

/**
 * The file picker accepts three formats; the bytes decide which parser runs.
 * The extension is only a fallback for an archive whose signature is missing.
 */
export function detectImportFormat(
  bytes: Uint8Array,
  fileName: string
): ImportFormat | null {
  if (ZIP_SIGNATURES.some((signature) => startsWith(bytes, signature))) {
    return "folio-vault";
  }
  if (looksLikeJson(bytes)) return "folio-json";
  if (hasTarMagic(bytes)) return "joplin";
  return formatForExtension(fileName);
}
