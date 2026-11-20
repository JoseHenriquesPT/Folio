import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import type { NotebookRow as NotebookRowData } from "../db/database.types";
import { useLongPress } from "../hooks/useLongPress";
import type { ActionAnchor } from "../lib/actionMenu";
import type { NotebookNode } from "../lib/notebooks";
import type { NotebookBadge } from "../lib/notebookShares";
import NavIcon from "./NavIcon";

export interface NotebookRowProps {
  node: NotebookNode;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  active: boolean;
  owned: boolean;
  badge: NotebookBadge | undefined;
  onToggleCollapse: (notebookId: string) => void;
  onActions?: (notebook: NotebookRowData, anchor: ActionAnchor) => void;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

/**
 * One sidebar row. Owned rows get the app's own action menu on right-click or
 * long-press, exactly like note cards; shared rows stay read-only with no menu.
 */
export default function NotebookRow({
  node,
  depth,
  hasChildren,
  collapsed,
  active,
  owned,
  badge,
  onToggleCollapse,
  onActions,
  onDragStart,
}: NotebookRowProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const menuEnabled = owned && Boolean(onActions);

  useLongPress({
    ref: linkRef,
    enabled: menuEnabled,
    onRelease: (point, dragged) => {
      if (!dragged) onActions?.(node, point);
    },
  });

  return (
    <div
      className="notebook-row"
      data-notebook-row
      data-notebook-id={node.id}
      style={{ paddingLeft: `${depth * 14}px` }}
    >
      {hasChildren ? (
        <button
          type="button"
          className="notebook-toggle"
          aria-label={
            collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`
          }
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapse(node.id)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      ) : (
        <span className="notebook-toggle spacer" aria-hidden="true" />
      )}

      <Link
        ref={linkRef}
        to={`/?notebook=${node.id}`}
        className={`sidebar-link notebook-link${active ? " active" : ""}`}
        aria-current={active ? "page" : undefined}
        onContextMenu={(event) => {
          // Shift keeps the browser's own menu, here as everywhere else.
          if (event.shiftKey || !menuEnabled) return;
          event.preventDefault();
          onActions?.(node, { x: event.clientX, y: event.clientY });
        }}
        {...(owned
          ? {
              "data-drop-kind": "notebook",
              "data-drop-id": node.id,
              "data-drop-label": node.name,
            }
          : {})}
      >
        <NavIcon name="notebook" />
        <span>{node.name}</span>
        {badge ? (
          <span className="badge share notebook-badge" title={badge.title}>
            {badge.label}
          </span>
        ) : null}
      </Link>

      {owned ? (
        <button
          type="button"
          className="notebook-grip"
          aria-label={`Move ${node.name}`}
          title="Drag to reorder or nest"
          onPointerDown={onDragStart}
        >
          ⠿
        </button>
      ) : null}
    </div>
  );
}
