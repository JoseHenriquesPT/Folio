import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { NotebookRow } from "../db/database.types";
import type { ActionAnchor } from "../lib/actionMenu";
import { buildNotebookTree, visibleNotebookRows } from "../lib/notebooks";
import type { NotebookBadge } from "../lib/notebookShares";
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
  onActions = vi.fn(),
  list = notebooks,
  currentUserId = "user-1",
  badges = new Map<string, NotebookBadge>(),
}: {
  collapsed?: ReadonlySet<string>;
  activeId?: string | null;
  onToggleCollapse?: (id: string) => void;
  onDrop?: (plan: unknown) => void;
  onActions?: (notebook: NotebookRow, anchor: ActionAnchor) => void;
  list?: NotebookRow[];
  currentUserId?: string;
  badges?: ReadonlyMap<string, NotebookBadge>;
} = {}) {
  return render(
    <MemoryRouter>
      <NotebookTree
        notebooks={list}
        rows={visibleNotebookRows(buildNotebookTree(list), collapsed)}
        activeId={activeId}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onDrop={onDrop}
        onActions={onActions}
        currentUserId={currentUserId}
        badges={badges}
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

  it("shows a badge with its tooltip", () => {
    renderTree({
      badges: new Map([
        ["root", { label: "Shared", title: "Shared with 1 person." }],
      ]),
    });

    const badge = screen.getByText("Shared");
    expect(badge.getAttribute("title")).toBe("Shared with 1 person.");
  });

  it("keeps shared notebooks read-only in the tree", () => {
    renderTree({
      list: [
        notebook({ id: "theirs", name: "Theirs", owner_id: "user-2" }),
        ...notebooks,
      ],
    });

    const shared = screen.getByRole("link", { name: "Theirs" });
    expect(shared.getAttribute("data-drop-kind")).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Theirs" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move Work" })).toBeTruthy();
  });

  it("opens an owned notebook's menu on right-click at the pointer", () => {
    const onActions = vi.fn();
    renderTree({ onActions });

    const opened = fireEvent.contextMenu(
      screen.getByRole("link", { name: "Work" }),
      { clientX: 120, clientY: 240 }
    );

    expect(opened).toBe(false);
    expect(onActions).toHaveBeenCalledOnce();
    expect(onActions.mock.calls[0][0]).toMatchObject({
      id: "root",
      name: "Work",
      owner_id: "user-1",
    });
    expect(onActions.mock.calls[0][1]).toEqual({ x: 120, y: 240 });
  });

  it("keeps the browser menu on Shift+right-click", () => {
    const onActions = vi.fn();
    renderTree({ onActions });

    const opened = fireEvent.contextMenu(
      screen.getByRole("link", { name: "Work" }),
      { shiftKey: true }
    );

    expect(opened).toBe(true);
    expect(onActions).not.toHaveBeenCalled();
  });

  it("opens no menu on a notebook shared with the viewer", () => {
    const onActions = vi.fn();
    renderTree({
      onActions,
      list: [notebook({ id: "theirs", name: "Theirs", owner_id: "user-2" })],
    });

    const opened = fireEvent.contextMenu(
      screen.getByRole("link", { name: "Theirs" })
    );

    expect(opened).toBe(true);
    expect(onActions).not.toHaveBeenCalled();
  });

  it("opens an owned notebook's menu after a long press", () => {
    vi.useFakeTimers();
    try {
      const onActions = vi.fn();
      renderTree({ onActions });
      const link = screen.getByRole("link", { name: "Work" });

      link.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 30,
          clientY: 40,
          button: 0,
        })
      );
      act(() => {
        vi.advanceTimersByTime(500);
      });
      window.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          clientX: 30,
          clientY: 40,
        })
      );

      expect(onActions).toHaveBeenCalledOnce();
      expect(onActions.mock.calls[0][0]).toMatchObject({ id: "root" });
      expect(onActions.mock.calls[0][1]).toEqual({ x: 30, y: 40 });
    } finally {
      vi.useRealTimers();
    }
  });
});
