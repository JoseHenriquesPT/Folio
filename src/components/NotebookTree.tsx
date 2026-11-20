import { Link } from "react-router-dom";
import type { NotebookRow as NotebookRowData } from "../db/database.types";
import { useNotebookDrag } from "../hooks/useNotebookDrag";
import type { ActionAnchor } from "../lib/actionMenu";
import { UNFILED_ID } from "../lib/dragNote";
import type {
  NotebookDropPlan,
  VisibleNotebookRow,
} from "../lib/notebooks";
import type { NotebookBadge } from "../lib/notebookShares";
import NavIcon from "./NavIcon";
import NotebookRow from "./NotebookRow";

interface NotebookTreeProps {
  notebooks: NotebookRowData[];
  rows: VisibleNotebookRow[];
  activeId: string | null;
  collapsed: ReadonlySet<string>;
  currentUserId: string;
  badges: ReadonlyMap<string, NotebookBadge>;
  onToggleCollapse: (notebookId: string) => void;
  onDrop: (plan: NotebookDropPlan) => void;
  onActions?: (notebook: NotebookRowData, anchor: ActionAnchor) => void;
}

/**
 * The sidebar's notebooks: reorder by dragging a grip, nest by dropping in the
 * middle of a row, and collapse a branch with its chevron. Rows keep carrying
 * the note-drop attributes so cards can still be dropped onto a notebook;
 * notebooks shared with the user stay read-only, badged at the subtree root.
 */
export default function NotebookTree({
  notebooks,
  rows,
  activeId,
  collapsed,
  currentUserId,
  badges,
  onToggleCollapse,
  onDrop,
  onActions,
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

      {rows.map(({ node, depth, hasChildren }) => (
        <NotebookRow
          key={node.id}
          node={node}
          depth={depth}
          hasChildren={hasChildren}
          collapsed={collapsed.has(node.id)}
          active={activeId === node.id}
          owned={node.owner_id === currentUserId}
          badge={badges.get(node.id)}
          onToggleCollapse={onToggleCollapse}
          onActions={onActions}
          onDragStart={(event) => start(event, node.id, node.name)}
        />
      ))}

      <div className="notebook-root-drop" aria-hidden="true">
        Drop here for top level
      </div>
    </div>
  );
}
