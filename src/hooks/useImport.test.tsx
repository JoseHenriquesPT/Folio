import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTar } from "../test/tarBuilder";
import {
  NOTEBOOK_IDEAS,
  NOTE_CARD_GAMES,
  joplinItem,
} from "../lib/__fixtures__/joplin";
import { folioBackupFixture } from "../lib/__fixtures__/folioBackup";
import { buildFolioVaultZip } from "../lib/__fixtures__/folioVault";
import type { ImportResult } from "../db/import";
import { createFakeDb } from "../test/fakeDb";

const deps = vi.hoisted(() => ({
  runImport: vi.fn(),
}));

vi.mock("../db/import", () => ({
  runImport: deps.runImport,
}));

import { useImport } from "./useImport";

const NOW = new Date("2026-10-28T09:00:00.000Z");

function fileFrom(
  files: Array<{ path: string; content: string | Uint8Array }>,
  name = "export.jex"
): File {
  const tar = buildTar(files);
  return new File([tar.slice()], name, { type: "application/x-tar" });
}

const SMALL_EXPORT = [
  joplinItem({ id: NOTEBOOK_IDEAS, type: 2, title: "Ideas" }),
  joplinItem({
    id: NOTE_CARD_GAMES,
    type: 1,
    title: "Card Games",
    parentId: NOTEBOOK_IDEAS,
    body: "Hello",
  }),
];

const RESULT: ImportResult = {
  rootNotebookId: "root-1",
  rootNotebookName: "Imported from Joplin — 2026-10-28",
  notebooks: 2,
  notes: 1,
  attachments: 0,
  tags: 0,
  failures: [],
  cancelled: false,
};

function setup() {
  const db = createFakeDb();
  const toast = { push: vi.fn() };
  const hook = renderHook(() =>
    useImport({ client: db.client, toast, now: () => NOW })
  );
  return { db, toast, hook };
}

beforeEach(() => {
  deps.runImport.mockReset();
});

describe("useImport", () => {
  it("previews a Joplin archive without writing anything", async () => {
    const { hook } = setup();

    let plan: Awaited<ReturnType<typeof hook.result.current.preview>> = null;
    await act(async () => {
      plan = await hook.result.current.preview(fileFrom(SMALL_EXPORT));
    });

    expect(plan).toMatchObject({
      source: "joplin",
      counts: { notes: 1, notebooks: 1 },
    });
    expect(hook.result.current.plan?.counts.notes).toBe(1);
    expect(hook.result.current.running).toBe(false);
    expect(deps.runImport).not.toHaveBeenCalled();
  });

  it("previews a Folio JSON backup", async () => {
    const { hook } = setup();
    const file = new File([JSON.stringify(folioBackupFixture())], "backup.json", {
      type: "application/json",
    });

    await act(async () => {
      await hook.result.current.preview(file);
    });

    expect(hook.result.current.plan).toMatchObject({
      source: "folio-json",
      counts: { notes: 3, notebooks: 2, attachments: 2, tags: 3 },
    });
    expect(hook.result.current.error).toBeNull();
  });

  it("previews a Folio vault zip", async () => {
    const { hook } = setup();
    const zip = await buildFolioVaultZip();
    const file = new File([zip.slice()], "vault.zip", { type: "application/zip" });

    await act(async () => {
      await hook.result.current.preview(file);
    });

    expect(hook.result.current.plan).toMatchObject({
      source: "folio-vault",
      counts: { notes: 3, notebooks: 3, attachments: 2 },
    });
  });

  it("reads the bytes rather than trusting the file name", async () => {
    const { hook } = setup();
    const file = new File([JSON.stringify(folioBackupFixture())], "export.jex");

    await act(async () => {
      await hook.result.current.preview(file);
    });

    expect(hook.result.current.plan?.source).toBe("folio-json");
  });

  it("explains a file it cannot identify", async () => {
    const { toast, hook } = setup();
    const file = new File([new Uint8Array(8)], "notes.txt");

    await act(async () => {
      await hook.result.current.preview(file);
    });

    expect(hook.result.current.plan).toBeNull();
    expect(hook.result.current.error).toMatch(
      /not a Joplin export, a Folio vault zip, or a Folio JSON backup/i
    );
    expect(toast.push).toHaveBeenCalledWith(
      expect.stringMatching(/not a Joplin export/i),
      "error"
    );
  });

  it("imports the previewed plan and reports the result", async () => {
    deps.runImport.mockResolvedValue(RESULT);

    const { toast, hook } = setup();

    await act(async () => {
      await hook.result.current.preview(fileFrom(SMALL_EXPORT));
    });
    await act(async () => {
      await hook.result.current.run();
    });

    expect(deps.runImport).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          source: "joplin",
          counts: expect.objectContaining({ notes: 1 }),
        }),
        now: NOW,
      })
    );
    expect(hook.result.current).toMatchObject({
      running: false,
      result: RESULT,
      failures: [],
      error: null,
    });
    expect(toast.push).toHaveBeenCalledWith("Imported 1 note.", "success");
  });

  it("surfaces per-item failures in the report", async () => {
    deps.runImport.mockResolvedValue({
      ...RESULT,
      tags: 2,
      failures: [
        { kind: "attachment", name: "huge.bin", message: "Too large." },
      ],
    });

    const { toast, hook } = setup();

    await act(async () => {
      await hook.result.current.preview(fileFrom(SMALL_EXPORT));
    });
    await act(async () => {
      await hook.result.current.run();
    });

    expect(hook.result.current.failures).toEqual([
      { kind: "attachment", name: "huge.bin", message: "Too large." },
    ]);
    expect(toast.push).toHaveBeenCalledWith(
      "Imported 1 note with 1 problem.",
      "info"
    );
  });

  it("stops on cancel and says so", async () => {
    let signal: AbortSignal | undefined;
    deps.runImport.mockImplementation(
      (options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.signal;
          options.signal?.addEventListener("abort", () =>
            reject(new DOMException("Cancelled.", "AbortError"))
          );
        })
    );

    const { toast, hook } = setup();

    await act(async () => {
      await hook.result.current.preview(fileFrom(SMALL_EXPORT));
    });

    act(() => {
      void hook.result.current.run();
    });
    act(() => {
      hook.result.current.cancel();
    });

    await waitFor(() => expect(hook.result.current.running).toBe(false));

    expect(signal?.aborted).toBe(true);
    expect(hook.result.current.error).toBeNull();
    expect(toast.push).toHaveBeenCalledWith("Import cancelled.", "info");
  });

  it("needs a preview before it can import", async () => {
    const { hook } = setup();

    await act(async () => {
      await hook.result.current.run();
    });

    expect(deps.runImport).not.toHaveBeenCalled();
  });

  it("clears the preview on reset", async () => {
    const { hook } = setup();

    await act(async () => {
      await hook.result.current.preview(fileFrom(SMALL_EXPORT));
    });
    act(() => {
      hook.result.current.reset();
    });

    expect(hook.result.current).toMatchObject({
      plan: null,
      result: null,
      failures: [],
      error: null,
    });
  });
});
