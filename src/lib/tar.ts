const BLOCK = 512;
const NAME_LENGTH = 100;
const PREFIX_LENGTH = 155;
const SIZE_OFFSET = 124;
const SIZE_LENGTH = 12;
const CHECKSUM_OFFSET = 148;
const CHECKSUM_LENGTH = 8;
const TYPEFLAG_OFFSET = 156;
const PREFIX_OFFSET = 345;

const decoder = new TextDecoder();

export interface TarEntry {
  path: string;
  bytes: Uint8Array;
}

export class TarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TarError";
  }
}

function readString(block: Uint8Array, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return decoder.decode(end === -1 ? slice : slice.subarray(0, end)).trim();
}

function readNumber(block: Uint8Array, offset: number, length: number): number {
  const raw = block.subarray(offset, offset + length);
  if ((raw[0] & 0x80) !== 0) {
    throw new TarError("This Joplin export uses a tar variant Folio cannot read.");
  }

  const text = readString(block, offset, length);
  if (text === "") return 0;

  const value = Number.parseInt(text, 8);
  if (!Number.isFinite(value) || value < 0) {
    throw new TarError("This Joplin export has a corrupted tar header.");
  }
  return value;
}

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

function hasValidChecksum(block: Uint8Array): boolean {
  const stored = readNumber(block, CHECKSUM_OFFSET, CHECKSUM_LENGTH);
  let total = 0;

  for (let index = 0; index < BLOCK; index += 1) {
    const inChecksumField =
      index >= CHECKSUM_OFFSET && index < CHECKSUM_OFFSET + CHECKSUM_LENGTH;
    total += inChecksumField ? 0x20 : block[index];
  }

  return total === stored;
}

function entryPath(block: Uint8Array): string {
  const name = readString(block, 0, NAME_LENGTH);
  const prefix = readString(block, PREFIX_OFFSET, PREFIX_LENGTH);
  const combined = prefix === "" ? name : `${prefix}/${name}`;
  return combined.replace(/^\.\//, "");
}

export function readTar(archive: Uint8Array): TarEntry[] {
  if (archive.length < BLOCK) {
    throw new TarError("This file is not a readable Joplin export.");
  }

  const entries: TarEntry[] = [];
  let offset = 0;
  let pendingLongName: string | null = null;

  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (isZeroBlock(header)) break;

    if (!hasValidChecksum(header)) {
      throw new TarError("This file is not a readable Joplin export.");
    }

    const size = readNumber(header, SIZE_OFFSET, SIZE_LENGTH);
    const type = String.fromCharCode(header[TYPEFLAG_OFFSET] || 0x30);
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;

    if (dataEnd > archive.length) {
      throw new TarError("This Joplin export is truncated.");
    }

    if (type === "L") {
      pendingLongName = decoder.decode(archive.subarray(dataStart, dataEnd)).replace(/\0+$/, "");
    } else if (type === "x" || type === "g") {
      // PAX extended headers carry metadata Folio does not use.
    } else if (type === "0" || type === "\0") {
      const path = pendingLongName ?? entryPath(header);
      if (path !== "") {
        entries.push({ path, bytes: archive.subarray(dataStart, dataEnd) });
      }
      pendingLongName = null;
    } else if (type === "5") {
      pendingLongName = null;
    } else {
      pendingLongName = null;
    }

    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }

  return entries;
}
