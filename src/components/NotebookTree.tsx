import { Link } from "react-router-dom";
import type { NotebookRow } from "../db/database.types";
import { useNotebookDrag } from "../hooks/useNotebookDrag";
import { UNFILED_ID } from "../lib/dragNote";
import type {
  NotebookDropPlan,
  VisibleNotebookRow,
} from "../lib/notebooks";
import NavIcon from "./NavIcon";

interface NotebookTreeProps {
  notebooks: NotebookRow[];
  rows: VisibleNotebookRow[];
  activeId: string | null;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (notebookId: string) => void;
  onDrop: (plan: NotebookDropPlan) => void;
}

/**
 * The sidebar's notebooks: reorder by dragging a grip, nest by dropping in the
 * middle of a row, and collapse a branch with its chevron. Rows keep carrying
 * the note-drop attributes so cards can still be dropped onto a notebook.
 */
export default function NotebookTree({
  notebooks,
  rows,
  activeId,
  collapsed,
  onToggleCollapse,
  onDrop,
}: NotebookTreeProps) {
  const { draggingId, start } = useNotebookDrag({ notebooks, onDrop });

  return (
    <div
      className={`sidebar-links notebook-tree${draggingId ? " dragging" : ""}`}
      data-notebook-root
    >
      <Link
        to="/?notebook=unfiled"
        className={`sidebar-link${activeId === UNFILED_ID ? " active" : ""}`}
        aria-current={activeId === UNFILED_ID ? "page" : undefined}
        data-drop-kind="notebook"
        data-drop-id={UNFILED_ID}
        data-drop-label="Unfiled"
      >
        <NavIcon name="notebook" />
        <span>Unfiled</span>
      </Link>

      {rows.map(({ node, depth, hasChildren }) => {
        const isCollapsed = collapsed.has(node.id);
        return (
          <div
            key={node.id}
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
                  isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`
                }
                aria-expanded={!isCollapsed}
                onClick={() => onToggleCollapse(node.id)}
              >
                {isCollapsed ? "▸" : "▾"}
              </button>
            ) : (
              <span className="notebook-toggle spacer" aria-hidden="true" />
            )}

            <Link
              to={`/?notebook=${node.id}`}
              className={`sidebar-link notebook-link${activeId === node.id ? " active" : ""}`}
              aria-current={activeId === node.id ? "page" : undefined}
              data-drop-kind="notebook"
              data-drop-id={node.id}
              data-drop-label={node.name}
            >
              <NavIcon name="notebook" />
              <span>{node.name}</span>
            </Link>

            <button
              type="button"
              className="notebook-grip"
              aria-label={`Move ${node.name}`}
              title="Drag to reorder or nest"
              onPointerDown={(event) => start(event, node.id, node.name)}
            >
              ⠿
            </button>
          </div>
        );
      })}

      <div className="notebook-root-drop" aria-hidden="true">
        Drop here for top level
      </div>
    </div>
  );
}
