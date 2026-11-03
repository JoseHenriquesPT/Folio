import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Note } from "../db/notes";
import NoteHeader, { type NoteHeaderProps } from "./NoteHeader";

const note: Note = {
  id: "note-1",
  owner_id: "user-1",
  notebook_id: null,
  title: "Groceries",
  body_html: "<p>Milk</p>",
  body_text: "Milk",
  search: null,
  pinned: false,
  archived: false,
  deleted_at: null,
  version: 2,
  last_edited_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

function setup(overrides: Partial<NoteHeaderProps> = {}) {
  const props: NoteHeaderProps = {
    title: "Groceries",
    mode: "view",
    canEdit: true,
    status: "saved",
    hasNote: true,
    busy: false,
    finishing: false,
    note,
    isOwner: true,
    isTrashed: false,
    canManage: true,
    shareCount: 0,
    onBack: vi.fn(),
    onTitleChange: vi.fn(),
    onToggleMode: vi.fn(),
    onShare: vi.fn(),
    onTogglePin: vi.fn(),
    onToggleArchive: vi.fn(),
    onTrash: vi.fn(),
    onRestore: vi.fn(),
    onDeleteForever: vi.fn(),
    ...overrides,
  };

  render(<NoteHeader {...props} />);
  return props;
}

describe("NoteHeader", () => {
  it("opens in view mode with a read-only title and an Edit button", () => {
    setup();

    expect(screen.getByLabelText("Note title").hasAttribute("readonly")).toBe(
      true
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("offers Done while editing and reports the toggle", () => {
    const props = setup({ mode: "edit" });

    expect(
      screen.getByLabelText("Note title").hasAttribute("readonly")
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(props.onToggleMode).toHaveBeenCalledOnce();
  });

  it("keeps the mode button away from a reader", () => {
    setup({ canEdit: false });

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("shows a fixed icon instead of save words", () => {
    const { container } = render(
      <NoteHeader {...baseProps({ status: "saving" })} />
    );

    expect(container.querySelector(".save-indicator")).not.toBeNull();
    expect(container.textContent).not.toContain("Saving");
  });

  it("lets the owner share and pin a saved note", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    expect(props.onShare).toHaveBeenCalledOnce();
    expect(props.onTogglePin).toHaveBeenCalledOnce();
  });
});

function baseProps(overrides: Partial<NoteHeaderProps>): NoteHeaderProps {
  return {
    title: "Groceries",
    mode: "view",
    canEdit: true,
    status: "idle",
    hasNote: true,
    busy: false,
    finishing: false,
    note,
    isOwner: true,
    isTrashed: false,
    canManage: true,
    shareCount: 0,
    onBack: vi.fn(),
    onTitleChange: vi.fn(),
    onToggleMode: vi.fn(),
    onShare: vi.fn(),
    onTogglePin: vi.fn(),
    onToggleArchive: vi.fn(),
    onTrash: vi.fn(),
    onRestore: vi.fn(),
    onDeleteForever: vi.fn(),
    ...overrides,
  };
}
