import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ImportDialog from "./ImportDialog";
import type { ImportController } from "../hooks/useImport";
import type { ImportPlan } from "../lib/importPlan";

function plan(overrides: Partial<ImportPlan> = {}): ImportPlan {
  return {
    source: "folio-json",
    rootLabel: "Folio",
    notebooks: [{ id: "nb-1", title: "Ideas", parentId: null }],
    notes: [
      {
        id: "note-1",
        title: "Card Games",
        bodyHtml: "<p>Body</p>",
        notebookId: "nb-1",
        createdAt: "2026-09-07T18:59:22.990Z",
        updatedAt: "2026-09-07T19:00:16.462Z",
        archived: false,
        tags: ["Games"],
        attachmentIds: [],
      },
      {
        id: "note-2",
        title: "Loose",
        bodyHtml: "<p>Body</p>",
        notebookId: null,
        createdAt: null,
        updatedAt: null,
        archived: true,
        tags: [],
        attachmentIds: [],
      },
    ],
    attachments: [
      {
        id: "att-1",
        sourceNoteId: "note-1",
        fileName: "table.png",
        mimeType: "image/png",
        sizeBytes: 3,
      },
    ],
    skipped: [{ path: "junk.bin", reason: "Not referenced by the manifest" }],
    warnings: ["This backup contains no attachment files."],
    counts: {
      notes: 2,
      notebooks: 1,
      attachments: 1,
      tags: 2,
      skipped: 1,
      linksRewritten: 3,
    },
    ...overrides,
  };
}

function controller(overrides: Partial<ImportController> = {}): ImportController {
  return {
    running: false,
    phase: null,
    completed: 0,
    total: 0,
    plan: null,
    result: null,
    failures: [],
    error: null,
    preview: vi.fn().mockResolvedValue(null),
    run: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe("ImportDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ImportDialog open={false} onClose={vi.fn()} controller={controller()} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("previews the chosen file and lists what will come in", () => {
    const state = controller({ plan: plan() });
    render(<ImportDialog open onClose={vi.fn()} controller={state} />);

    const file = new File([new Uint8Array([1, 2, 3])], "backup.json");
    fireEvent.change(screen.getByLabelText("Import file (.jex, .zip, .json)"), {
      target: { files: [file] },
    });

    expect(state.preview).toHaveBeenCalledWith(file);
    expect(screen.getByText("Detected a Folio JSON backup.")).toBeTruthy();
    expect(screen.getByText("2 notes, 1 notebook, 1 attachment, 2 tags")).toBeTruthy();
    expect(
      screen.getByText("This backup contains no attachment files.")
    ).toBeTruthy();
    expect(screen.getByText("junk.bin")).toBeTruthy();
    expect(screen.getByText("3 links rewritten")).toBeTruthy();
  });

  it("runs the import and then shows the report", () => {
    const state = controller({ plan: plan() });
    const { rerender } = render(
      <ImportDialog open onClose={vi.fn()} controller={state} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Import 2 notes" }));
    expect(state.run).toHaveBeenCalled();

    const failures = [
      {
        kind: "attachment" as const,
        name: "table.png",
        message: "The file could not be re-fetched from storage: Object not found",
      },
    ];

    rerender(
      <ImportDialog
        open
        onClose={vi.fn()}
        controller={controller({
          plan: plan(),
          result: {
            rootNotebookId: "root-1",
            rootNotebookName: "Imported from Folio — 2026-11-12",
            notebooks: 2,
            notes: 2,
            attachments: 0,
            tags: 2,
            failures,
            cancelled: false,
          },
          failures,
        })}
      />
    );

    expect(
      screen.getByText("Imported 2 notes, 2 notebooks, 0 attachments, 2 tags.")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Everything landed in the notebook “Imported from Folio — 2026-11-12”."
      )
    ).toBeTruthy();
    expect(screen.getByText("table.png")).toBeTruthy();
    expect(screen.getByText("The file could not be re-fetched", { exact: false })).toBeTruthy();
  });

  it("shows import progress with a cancel option", () => {
    const state = controller({
      running: true,
      phase: "importing",
      completed: 40,
      total: 145,
      plan: plan(),
    });
    render(<ImportDialog open onClose={vi.fn()} controller={state} />);

    expect(screen.getByText("Importing notes…")).toBeTruthy();
    expect(screen.getByText("40 of 145")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));
    expect(state.cancel).toHaveBeenCalled();
  });

  it("explains an unreadable file", () => {
    render(
      <ImportDialog
        open
        onClose={vi.fn()}
        controller={controller({
          error: "This file is not a Joplin export, a Folio vault zip, or a Folio JSON backup.",
        })}
      />
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "not a Joplin export, a Folio vault zip, or a Folio JSON backup"
    );
  });

  it("clears the preview when the dialog closes", () => {
    const state = controller({ plan: plan() });
    const onClose = vi.fn();
    render(<ImportDialog open onClose={onClose} controller={state} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
