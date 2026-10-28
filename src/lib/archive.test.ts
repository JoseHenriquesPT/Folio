import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { buildZip, saveBlob } from "./archive";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("buildZip", () => {
  it("writes text and binary entries", async () => {
    const archive = await buildZip([
      { path: "README.txt", text: "hello" },
      { path: "attachments/a.png", bytes: encoder.encode("png-bytes") },
    ]);

    const zip = await JSZip.loadAsync(archive);

    // JSZip records implicit folder entries such as "attachments/"; only the
    // entries we wrote are of interest here.
    const entries = Object.values(zip.files)
      .filter((file) => !file.dir)
      .map((file) => file.name)
      .sort();

    expect(entries).toEqual(["README.txt", "attachments/a.png"]);
    expect(await zip.file("README.txt")?.async("string")).toBe("hello");
    const bytes = await zip.file("attachments/a.png")?.async("uint8array");
    expect(decoder.decode(bytes)).toBe("png-bytes");
  });

  it("keeps the order it was given", async () => {
    const archive = await buildZip([
      { path: "b.txt", text: "b" },
      { path: "a.txt", text: "a" },
    ]);

    const zip = await JSZip.loadAsync(archive);

    expect(Object.keys(zip.files)).toEqual(["b.txt", "a.txt"]);
  });

  it("treats a missing payload as an empty file", async () => {
    const archive = await buildZip([{ path: "empty.txt" }]);
    const zip = await JSZip.loadAsync(archive);

    expect(await zip.file("empty.txt")?.async("string")).toBe("");
  });
});

describe("saveBlob", () => {
  it("clicks a download link and revokes the url", async () => {
    const createObjectURL = vi.fn(() => "blob:folio");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const clicked: HTMLAnchorElement[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });

    saveBlob(new Blob(["x"]), "export.zip");

    expect(createObjectURL).toHaveBeenCalled();
    expect(clicked[0]?.download).toBe("export.zip");
    expect(clicked[0]?.href).toBe("blob:folio");
    expect(clicked[0]?.isConnected).toBe(false);

    vi.unstubAllGlobals();
    click.mockRestore();
  });
});
