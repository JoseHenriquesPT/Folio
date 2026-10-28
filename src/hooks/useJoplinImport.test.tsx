import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTar } from "../test/tarBuilder";
import {
  NOTEBOOK_IDEAS,
  NOTE_CARD_GAMES,
  joplinItem,
} from "../lib/__fixtures__/joplin";
import type { ImportResult } from "../db/import";
import { createFakeDb } from "../test/fakeDb";

const deps = vi.hoisted(() => ({
  runJoplinImport: vi.fn(),
}));

vi.mock("../db/import", () => ({
  runJoplinImport: deps.runJoplinImport,
}));

import { useJoplinImport } from "./useJoplinImport";

const NOW = new Date("2026-10-28T09:00:00.000Z");

function fileFrom(files: Array<{ path: string; content: string | Uint8Array }>): File {
  const tar = buildTar(files);
  return new File([tar.slice()], "export.jex", { type: "application/x-tar" });
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
  failures: [],
  cancelled: false,
};

function setup() {
  const db = createFakeDb();
  const toast = { push: vi.fn() };
  const hook = renderHook(() =>
    useJoplinImport({ client: db.client, toast, now: () => NOW })
  );
  return { db, toast, hook };
}

beforeEach(() => {
  deps.runJoplinImport.mockReset();
});

describe("useJoplinImport", () => {
  it("previews a Joplin archive without writing anything", async () => {
    const { hook } = setup();

    let plan: unknown;
    await act(async () => {
      plan = await hook.result.current.preview(fileFrom(SMALL_EXPORT));
    });

    expect(plan).toMatchObject({
      counts: { notes: 1, notebooks: 1, resources: 0 },
    });
    expect(hook.result.current.plan?.counts.notes).toBe(1);
    expect(hook.result.current.running).toBe(false);
    expect(deps.runJoplinImport).not.toHaveBeenCalled();
  });

  it("explains a file that is not a Joplin export", async () => {
    const { toast, hook } = setup();
    const file = new File([new Uint8Array(8)], "notes.txt");

    await act(async () => {
      await hook.result.current.preview(file);
    });

    expect(hook.result.current.plan).toBeNull();
    expect(hook.result.current.error).toMatch(/Joplin export/);
    expect(toast.push).toHaveBeenCalledWith(
      expect.stringMatching(/Joplin export/),
      "error"
    );
  });

  it("imports the previewed plan and reports the result", async () => {
    deps.runJoplinImport.mockResolvedValue(RESULT);

    const { toast, hook } = setup();
    const file = fileFrom(SMALL_EXPORT);

    await act(async () => {
      await hook.result.current.preview(file);
    });
    await act(async () => {
      await hook.result.current.run();
    });

    expect(deps.runJoplinImport).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ counts: expect.objectContaining({ notes: 1 }) }),
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
    deps.runJoplinImport.mockResolvedValue({
      ...RESULT,
      attachments: 0,
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
    deps.runJoplinImport.mockImplementation(
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

    expect(deps.runJoplinImport).not.toHaveBeenCalled();
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
