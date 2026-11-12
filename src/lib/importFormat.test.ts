import { describe, expect, it } from "vitest";
import { detectImportFormat } from "./importFormat";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function tarHeader(): Uint8Array {
  const header = new Uint8Array(512);
  header.set(bytes("ustar"), 257);
  return header;
}

describe("detectImportFormat", () => {
  it("recognises a Folio JSON backup by its first character", () => {
    expect(detectImportFormat(bytes('{"format":"folio-backup"}'), "backup.json")).toBe(
      "folio-json"
    );
  });

  it("skips a byte-order mark and whitespace before JSON", () => {
    expect(
      detectImportFormat(bytes('\uFEFF \n\t{"format":"folio-backup"}'), "backup")
    ).toBe("folio-json");
  });

  it("recognises a zip by its local-file signature", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(detectImportFormat(zip, "vault.zip")).toBe("folio-vault");
  });

  it("recognises a Joplin tar by the ustar marker", () => {
    expect(detectImportFormat(tarHeader(), "export.jex")).toBe("joplin");
  });

  it("falls back to the file extension when the signature is unknown", () => {
    const unknown = new Uint8Array([1, 2, 3]);
    expect(detectImportFormat(unknown, "backup.JSON")).toBe("folio-json");
    expect(detectImportFormat(unknown, "vault.ZIP")).toBe("folio-vault");
    expect(detectImportFormat(unknown, "export.jex")).toBe("joplin");
  });

  it("refuses a file it cannot identify", () => {
    expect(detectImportFormat(new Uint8Array([1, 2, 3]), "notes.txt")).toBeNull();
  });
});
