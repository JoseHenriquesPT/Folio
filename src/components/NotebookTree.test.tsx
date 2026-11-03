import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { NotebookRow } from "../db/database.types";
import { buildNotebookTree, visibleNotebookRows } from "../lib/notebooks";
import NotebookTree from "./NotebookTree";

function notebook(overrides: Partial<NotebookRow> = {}): NotebookRow {
  return {
    id: "root",
    owner_id: "user-1",
    parent_id: null,
    name: "Work",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const notebooks = [
  notebook(),
  notebook({ id: "child", name: "Projects", parent_id: "root", position: 0 }),
  notebook({ id: "other", name: "Personal", position: 1 }),
];

function renderTree({
  collapsed = new Set<string>(),
  activeId = null,
  onToggleCollapse = vi.fn(),
  onDrop = vi.fn(),
}: {
  collapsed?: ReadonlySet<string>;
  activeId?: string | null;
  onToggleCollapse?: (id: string) => void;
  onDrop?: (plan: unknown) => void;
} = {}) {
  return render(
    <MemoryRouter>
      <NotebookTree
        notebooks={notebooks}
        rows={visibleNotebookRows(buildNotebookTree(notebooks), collapsed)}
        activeId={activeId}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onDrop={onDrop}
      />
    </MemoryRouter>
  );
}

describe("NotebookTree", () => {
  it("shows the notebook tree with an Unfiled row", () => {
    renderTree();

    expect(screen.getByRole("link", { name: "Unfiled" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Work" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Projects" })).toBeTruthy();
  });

  it("hides children under a collapsed notebook and keeps the toggle", () => {
    const onToggleCollapse = vi.fn();
    renderTree({
      collapsed: new Set(["root"]),
      onToggleCollapse,
    });

    expect(screen.queryByRole("link", { name: "Projects" })).toBeNull();
    const toggle = screen.getByRole("button", { name: "Expand Work" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(onToggleCollapse).toHaveBeenCalledWith("root");
  });

  it("marks the open notebook as current", () => {
    renderTree({ activeId: "child" });

    expect(
      screen.getByRole("link", { name: "Projects" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("offers a grip per notebook for moving it", () => {
    renderTree();

    expect(screen.getByRole("button", { name: "Move Work" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move Personal" })).toBeTruthy();
  });
});
