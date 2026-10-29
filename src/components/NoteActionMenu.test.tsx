import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NoteActionMenu, { type NoteActionAnchor } from "./NoteActionMenu";
import type { NoteMenuItem } from "../lib/noteMenu";

const items: NoteMenuItem[] = [
  { id: "open", label: "Open" },
  { id: "pin", label: "Pin" },
  { id: "trash", label: "Move to trash", tone: "danger" },
];

const anchor: NoteActionAnchor = { x: 40, y: 60 };

function setup(open = true) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <>
      <button type="button">Elsewhere</button>
      <NoteActionMenu
        open={open}
        anchor={anchor}
        title="Shopping list"
        items={items}
        onSelect={onSelect}
        onClose={onClose}
      />
    </>
  );
  return { onSelect, onClose, view };
}

describe("NoteActionMenu", () => {
  it("is hidden until it is opened", () => {
    setup(false);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("lists the note's actions under a labelled menu", () => {
    setup();

    const menu = screen.getByRole("menu", { name: "Actions for Shopping list" });
    expect(menu.getAttribute("aria-orientation")).toBe("vertical");
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Open", "Pin", "Move to trash"]);
  });

  it("runs the chosen action and closes", async () => {
    const { onSelect, onClose } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("menuitem", { name: "Pin" }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("pin");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape and on an outside click", async () => {
    const { onClose } = setup();
    const user = userEvent.setup();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    onClose.mockClear();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("focuses the first action when opened and gives focus back on close", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const view = render(
      <>
        <button type="button">Elsewhere</button>
        <NoteActionMenu
          open={false}
          anchor={anchor}
          title="Shopping list"
          items={items}
          onSelect={onSelect}
          onClose={onClose}
        />
      </>
    );
    screen.getByRole("button", { name: "Elsewhere" }).focus();

    view.rerender(
      <>
        <button type="button">Elsewhere</button>
        <NoteActionMenu
          open
          anchor={anchor}
          title="Shopping list"
          items={items}
          onSelect={onSelect}
          onClose={onClose}
        />
      </>
    );
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Open" })
    );

    view.rerender(
      <>
        <button type="button">Elsewhere</button>
        <NoteActionMenu
          open={false}
          anchor={anchor}
          title="Shopping list"
          items={items}
          onSelect={onSelect}
          onClose={onClose}
        />
      </>
    );
    expect(document.activeElement?.textContent).toBe("Elsewhere");
  });

  it("closes when Tab moves focus out of the menu", async () => {
    const { onClose } = setup();
    const user = userEvent.setup();

    await user.tab({ shift: true });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves between actions with the arrow keys", () => {
    setup();

    const [first, second, third] = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(document.activeElement).toBe(third);

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(document.activeElement).toBe(second);
  });

  it("marks the destructive action", () => {
    setup();

    expect(
      screen.getByRole("menuitem", { name: "Move to trash" }).className
    ).toContain("danger");
  });
});
