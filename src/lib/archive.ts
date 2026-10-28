import JSZip from "jszip";

export interface ArchiveEntry {
  path: string;
  text?: string;
  bytes?: Uint8Array;
}

/**
 * Media is already compressed, so the archive is stored rather than deflated:
 * that keeps a 1 GB export from spending minutes re-compressing images.
 */
export async function buildZip(entries: ArchiveEntry[]): Promise<Uint8Array> {
  const zip = new JSZip();

  for (const entry of entries) {
    zip.file(entry.path, entry.bytes ?? entry.text ?? "");
  }

  return zip.generateAsync({
    type: "uint8array",
    compression: "STORE",
    platform: "UNIX",
  });
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
