import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Notebook } from "../db/notebooks";
import MoveNoteDialog from "./MoveNoteDialog";

const notebooks: Notebook[] = [
  {
    id: "nb-1",
    owner_id: "user-1",
    parent_id: null,
    name: "Ideas",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "nb-2",
    owner_id: "user-1",
    parent_id: "nb-1",
    name: "Sub ideas",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

function setup(currentNotebookId: string | null = null) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    <MoveNoteDialog
      open
      notebooks={notebooks}
      noteTitle="Shopping list"
      currentNotebookId={currentNotebookId}
      onPick={onPick}
      onClose={onClose}
    />
  );
  return { onPick, onClose };
}

describe("MoveNoteDialog", () => {
  it("lists Unfiled and every notebook under a labelled dialog", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Move to notebook" });
    expect(dialog.textContent).toContain("Shopping list");

    const choices = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label") !== "Close");
    expect(choices.map((button) => button.textContent)).toEqual([
      "Unfiled",
      "Ideas",
      "Sub ideas",
    ]);
  });

  it("indents nested notebooks", () => {
    setup();

    const nested = screen.getByRole("button", { name: "Sub ideas" });
    const top = screen.getByRole("button", { name: "Ideas" });
    expect(nested.style.paddingLeft).not.toBe(top.style.paddingLeft);
  });

  it("marks the notebook the note is already in", () => {
    setup("nb-1");

    expect(
      screen.getByRole("button", { name: "Ideas" }).getAttribute("aria-current")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Unfiled" }).getAttribute("aria-current")
    ).toBeNull();
  });

  it("hands the choice back with the notebook id, and null for Unfiled", async () => {
    const { onPick } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sub ideas" }));
    expect(onPick).toHaveBeenCalledExactlyOnceWith("nb-2");

    await user.click(screen.getByRole("button", { name: "Unfiled" }));
    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it("closes on Escape", async () => {
    const { onClose } = setup();
    const user = userEvent.setup();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
