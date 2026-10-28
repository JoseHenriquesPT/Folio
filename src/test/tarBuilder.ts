const BLOCK = 512;

export interface TarSource {
  path: string;
  content?: string | Uint8Array;
  directory?: boolean;
}

const encoder = new TextEncoder();

function writeString(
  block: Uint8Array,
  offset: number,
  length: number,
  value: string
): void {
  const bytes = encoder.encode(value);
  block.set(bytes.subarray(0, length), offset);
}

function writeOctal(
  block: Uint8Array,
  offset: number,
  length: number,
  value: number
): void {
  const text = value.toString(8).padStart(length - 1, "0");
  writeString(block, offset, length, `${text}\0`);
}

function checksum(block: Uint8Array): number {
  let total = 0;
  for (const byte of block) total += byte;
  return total;
}

function header(source: TarSource, size: number): Uint8Array {
  if (source.path.length > 100) {
    throw new Error(`Test tar path is too long for a ustar header: ${source.path}`);
  }

  const block = new Uint8Array(BLOCK);
  writeString(block, 0, 100, source.path);
  writeOctal(block, 100, 8, 0o644);
  writeOctal(block, 108, 8, 0);
  writeOctal(block, 116, 8, 0);
  writeOctal(block, 124, 12, size);
  writeOctal(block, 136, 12, 0);
  block.fill(0x20, 148, 156);
  block[156] = source.directory ? 0x35 : 0x30;
  writeString(block, 257, 6, "ustar\0");
  writeString(block, 263, 2, "00");
  writeString(block, 265, 32, "test");
  writeString(block, 297, 32, "test");

  const total = checksum(block).toString(8).padStart(6, "0");
  writeString(block, 148, 8, `${total}\0 `);

  return block;
}

function padded(size: number): number {
  return Math.ceil(size / BLOCK) * BLOCK;
}

export function buildTar(sources: TarSource[]): Uint8Array {
  const chunks: Uint8Array[] = [];

  for (const source of sources) {
    const bytes = source.directory
      ? new Uint8Array()
      : typeof source.content === "string"
        ? encoder.encode(source.content)
        : (source.content ?? new Uint8Array());

    chunks.push(header(source, bytes.length));
    if (bytes.length > 0) {
      chunks.push(bytes, new Uint8Array(padded(bytes.length) - bytes.length));
    }
  }

  chunks.push(new Uint8Array(BLOCK * 2));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const archive = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.length;
  }
  return archive;
}
