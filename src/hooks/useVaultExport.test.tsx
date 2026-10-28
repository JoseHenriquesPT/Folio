import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../test/fakeDb";
import type { ExportData } from "../db/export";

const deps = vi.hoisted(() => ({
  fetchExportData: vi.fn(),
  downloadAttachmentFiles: vi.fn(),
  buildZip: vi.fn(),
  saveBlob: vi.fn(),
}));

vi.mock("../db/export", () => ({
  fetchExportData: deps.fetchExportData,
  downloadAttachmentFiles: deps.downloadAttachmentFiles,
}));

vi.mock("../lib/archive", () => ({
  buildZip: deps.buildZip,
  saveBlob: deps.saveBlob,
}));

import { useVaultExport } from "./useVaultExport";

const NOW = new Date("2026-10-28T09:00:00.000Z");
const encoder = new TextEncoder();

const DATA: ExportData = {
  ownerId: "user-1",
  notes: [
    {
      id: "note-1",
      ownerId: "user-1",
      title: "Note",
      bodyHtml: "<p>Body</p>",
      notebookId: null,
      archived: false,
      deletedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      tags: [],
    },
  ],
  notebooks: [],
  attachments: [
    {
      id: "att-1",
      noteId: "note-1",
      fileName: "shot.png",
      mimeType: "image/png",
      sizeBytes: 3,
    },
  ],
  storagePaths: new Map([["att-1", "note-1/att-1.png"]]),
};

function setup(overrides: { ownerId?: string } = {}) {
  const db = createFakeDb();
  const toast = { push: vi.fn() };
  const hook = renderHook(() =>
    useVaultExport({
      client: db.client,
      ownerId: overrides.ownerId ?? "user-1",
      toast,
      now: () => NOW,
    })
  );
  return { db, toast, hook };
}

beforeEach(() => {
  deps.fetchExportData.mockReset();
  deps.downloadAttachmentFiles.mockReset();
  deps.buildZip.mockReset();
  deps.saveBlob.mockReset();
});

describe("useVaultExport", () => {
  it("builds the vault zip with notes and attachment bytes", async () => {
    deps.fetchExportData.mockResolvedValue(DATA);
    deps.downloadAttachmentFiles.mockImplementation(
      async ({ attachments, onProgress }: { attachments: unknown[]; onProgress?: (n: number, t: number) => void }) => {
        onProgress?.(attachments.length, attachments.length);
        return new Map([["att-1", encoder.encode("png")]]);
      }
    );
    deps.buildZip.mockResolvedValue(new Uint8Array([9]));

    const { toast, hook } = setup();

    await act(async () => {
      await hook.result.current.start("vault");
    });

    expect(deps.fetchExportData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ownerId: "user-1" })
    );
    expect(deps.downloadAttachmentFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          {
            id: "att-1",
            fileName: "shot.png",
            storagePath: "note-1/att-1.png",
          },
        ],
      })
    );

    const entries = deps.buildZip.mock.calls[0][0] as Array<{
      path: string;
      bytes?: Uint8Array;
    }>;
    expect(entries.map((entry) => entry.path)).toEqual([
      "README.txt",
      "manifest.json",
      "Note.md",
      "attachments/note-1/shot.png",
    ]);
    expect(entries[3].bytes).toEqual(encoder.encode("png"));

    const [blob, name] = deps.saveBlob.mock.calls[0] as [Blob, string];
    expect(name).toBe("folio-export-2026-10-28.zip");
    expect(blob.type).toBe("application/zip");
    expect(hook.result.current).toMatchObject({ running: false, error: null });
    expect(toast.push).toHaveBeenCalledWith("Exported 1 note.", "success");
  });

  it("saves the JSON backup without touching attachments", async () => {
    deps.fetchExportData.mockResolvedValue(DATA);

    const { toast, hook } = setup();

    await act(async () => {
      await hook.result.current.start("json");
    });

    expect(deps.downloadAttachmentFiles).not.toHaveBeenCalled();
    expect(deps.buildZip).not.toHaveBeenCalled();

    const [blob, name] = deps.saveBlob.mock.calls[0] as [Blob, string];
    expect(name).toBe("folio-backup-2026-10-28.json");
    expect(blob.type).toBe("application/json");
    expect(toast.push).toHaveBeenCalledWith("Backup downloaded.", "success");
  });

  it("cancels through the signal it handed to the data layer", async () => {
    let signal: AbortSignal | undefined;
    deps.fetchExportData.mockImplementation(
      (_client: unknown, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.signal;
          options.signal?.addEventListener("abort", () =>
            reject(new DOMException("Cancelled.", "AbortError"))
          );
        })
    );

    const { toast, hook } = setup();

    act(() => {
      void hook.result.current.start("vault");
    });
    act(() => {
      hook.result.current.cancel();
    });

    await waitFor(() => expect(hook.result.current.running).toBe(false));

    expect(signal?.aborted).toBe(true);
    expect(hook.result.current.error).toBeNull();
    expect(deps.saveBlob).not.toHaveBeenCalled();
    expect(toast.push).toHaveBeenCalledWith("Export cancelled.", "info");
  });

  it("reports a failure without leaving the export running", async () => {
    deps.fetchExportData.mockRejectedValue(new Error("Network down"));

    const { toast, hook } = setup();

    await act(async () => {
      await hook.result.current.start("vault");
    });

    expect(hook.result.current).toMatchObject({
      running: false,
      error: "Network down",
    });
    expect(toast.push).toHaveBeenCalledWith("Network down", "error");
  });

  it("ignores a second start while one is running", async () => {
    deps.fetchExportData.mockImplementation(
      () => new Promise(() => undefined)
    );

    const { hook } = setup();

    act(() => {
      void hook.result.current.start("vault");
    });
    await act(async () => {
      await hook.result.current.start("json");
    });

    expect(deps.fetchExportData).toHaveBeenCalledTimes(1);
  });
});
