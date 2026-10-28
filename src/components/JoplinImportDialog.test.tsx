import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import JoplinImportDialog from "./JoplinImportDialog";
import type { JoplinImportController } from "../hooks/useJoplinImport";
import type { JoplinImportPlan } from "../lib/joplin";

function plan(overrides: Partial<JoplinImportPlan> = {}): JoplinImportPlan {
  return {
    notebooks: [
      { id: "nb-1", title: "Ideas", parentId: null, createdAt: null, updatedAt: null },
      { id: "nb-2", title: "Web", parentId: "nb-1", createdAt: null, updatedAt: null },
    ],
    notes: [
      {
        id: "note-1",
        title: "Card Games",
        bodyHtml: "<p>Body</p>",
        notebookId: "nb-2",
        createdAt: null,
        updatedAt: null,
        resourceIds: [],
      },
      {
        id: "note-2",
        title: "Loose",
        bodyHtml: "<p>Body</p>",
        notebookId: null,
        createdAt: null,
        updatedAt: null,
        resourceIds: [],
      },
    ],
    resources: [
      {
        id: "res-1",
        fileName: "shot.png",
        mimeType: "image/png",
        bytes: new Uint8Array([1]),
      },
    ],
    skipped: [{ path: "junk.bin", reason: "Not a Joplin item or attachment" }],
    warnings: ["A link to another note was kept as plain text."],
    counts: { notes: 2, notebooks: 2, resources: 1, skipped: 1, rewrittenLinks: 3 },
    ...overrides,
  };
}

function controller(overrides: Partial<JoplinImportController> = {}): JoplinImportController {
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

describe("JoplinImportDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <JoplinImportDialog open={false} onClose={vi.fn()} controller={controller()} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("previews the chosen file and lists what will come in", () => {
    const state = controller({ plan: plan() });
    render(<JoplinImportDialog open onClose={vi.fn()} controller={state} />);

    const file = new File([new Uint8Array([1, 2, 3])], "export.jex");
    fireEvent.change(screen.getByLabelText("Joplin export (.jex)"), {
      target: { files: [file] },
    });

    expect(state.preview).toHaveBeenCalledWith(file);
    expect(screen.getByText("2 notes, 2 notebooks, 1 attachment")).toBeTruthy();
    expect(
      screen.getByText("A link to another note was kept as plain text.")
    ).toBeTruthy();
    expect(screen.getByText("junk.bin")).toBeTruthy();
    expect(screen.getByText("3 links rewritten")).toBeTruthy();
  });

  it("runs the import and then shows the report", () => {
    const state = controller({ plan: plan() });
    const { rerender } = render(
      <JoplinImportDialog open onClose={vi.fn()} controller={state} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Import 2 notes" }));
    expect(state.run).toHaveBeenCalled();

    rerender(
      <JoplinImportDialog
        open
        onClose={vi.fn()}
        controller={controller({
          plan: plan(),
          result: {
            rootNotebookId: "root-1",
            rootNotebookName: "Imported from Joplin — 2026-10-28",
            notebooks: 2,
            notes: 2,
            attachments: 1,
            failures: [
              { kind: "attachment", name: "huge.bin", message: "Too large." },
            ],
            cancelled: false,
          },
          failures: [
            { kind: "attachment", name: "huge.bin", message: "Too large." },
          ],
        })}
      />
    );

    expect(screen.getByText("Imported 2 notes, 2 notebooks, 1 attachment.")).toBeTruthy();
    expect(
      screen.getByText(
        "Everything landed in the notebook “Imported from Joplin — 2026-10-28”."
      )
    ).toBeTruthy();
    expect(screen.getByText("huge.bin")).toBeTruthy();
    expect(screen.getByText("Too large.", { exact: false })).toBeTruthy();
  });

  it("shows import progress with a cancel option", () => {
    const state = controller({
      running: true,
      phase: "importing",
      completed: 40,
      total: 145,
      plan: plan(),
    });
    render(<JoplinImportDialog open onClose={vi.fn()} controller={state} />);

    expect(screen.getByText("Importing notes…")).toBeTruthy();
    expect(screen.getByText("40 of 145")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));
    expect(state.cancel).toHaveBeenCalled();
  });

  it("explains an unreadable file", () => {
    render(
      <JoplinImportDialog
        open
        onClose={vi.fn()}
        controller={controller({ error: "This file is not a readable Joplin export." })}
      />
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "not a readable Joplin export"
    );
  });

  it("clears the preview when the dialog closes", () => {
    const state = controller({ plan: plan() });
    const onClose = vi.fn();
    render(<JoplinImportDialog open onClose={onClose} controller={state} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
