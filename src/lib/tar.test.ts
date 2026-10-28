import { describe, expect, it } from "vitest";
import { TarError, readTar } from "./tar";
import { buildTar } from "../test/tarBuilder";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function text(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

describe("readTar", () => {
  it("reads regular files in order", () => {
    const archive = buildTar([
      { path: "b.md", content: "second" },
      { path: "a.md", content: "first" },
    ]);

    const entries = readTar(archive);

    expect(entries.map((entry) => entry.path)).toEqual(["b.md", "a.md"]);
    expect(text(entries[0].bytes)).toBe("second");
    expect(text(entries[1].bytes)).toBe("first");
  });

  it("keeps binary content intact across block padding", () => {
    const bytes = new Uint8Array(1500);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 251;
    }

    const entries = readTar(buildTar([{ path: "resources/a.png", content: bytes }]));

    expect(entries).toHaveLength(1);
    expect(entries[0].bytes).toEqual(bytes);
  });

  it("normalises a leading ./ and skips directory entries", () => {
    const entries = readTar(
      buildTar([
        { path: "./resources", directory: true },
        { path: "./resources/a.png", content: "png" },
      ])
    );

    expect(entries.map((entry) => entry.path)).toEqual(["resources/a.png"]);
  });

  it("stops at the end-of-archive block", () => {
    const archive = buildTar([{ path: "a.md", content: "one" }]);
    const withTrailingGarbage = new Uint8Array(archive.length + 512);
    withTrailingGarbage.set(archive);
    withTrailingGarbage.fill(0x41, archive.length);

    expect(readTar(withTrailingGarbage)).toHaveLength(1);
  });

  it("rejects a truncated archive", () => {
    const archive = buildTar([{ path: "a.md", content: "x".repeat(2048) }]);

    expect(() => readTar(archive.subarray(0, 900))).toThrow(TarError);
  });

  it("rejects a file that is not a tar archive", () => {
    const zip = new Uint8Array(1024);
    zip.set(encoder.encode("PK\u0003\u0004 not a tar"));

    expect(() => readTar(zip)).toThrow(
      /not a readable Joplin export/i
    );
  });

  it("rejects an empty file", () => {
    expect(() => readTar(new Uint8Array())).toThrow(TarError);
  });

  it("rejects a header whose checksum does not match", () => {
    const archive = buildTar([{ path: "a.md", content: "one" }]);
    archive[0] = 0x62;

    expect(() => readTar(archive)).toThrow(TarError);
  });
});
