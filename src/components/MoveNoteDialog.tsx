import type { Notebook } from "../db/notebooks";
import { buildNotebookTree, flattenNotebookTree } from "../lib/notebooks";
import Modal from "./Modal";

/**
 * The keyboard-and-screen-reader route to what a drag does: pick a notebook
 * for a note instead of holding and carrying it there.
 */
export default function MoveNoteDialog({
  open,
  notebooks,
  noteTitle,
  currentNotebookId,
  onPick,
  onClose,
}: {
  open: boolean;
  notebooks: Notebook[];
  noteTitle: string;
  currentNotebookId: string | null;
  onPick: (notebookId: string | null) => void;
  onClose: () => void;
}) {
  const rows = flattenNotebookTree(buildNotebookTree(notebooks));

  return (
    <Modal open={open} title="Move to notebook" onClose={onClose}>
      <p className="muted">
        Choose where <strong>{noteTitle}</strong> goes.
      </p>
      <div className="picker-list">
        <button
          type="button"
          className="note-menu-item"
          aria-current={currentNotebookId === null ? "true" : undefined}
          onClick={() => onPick(null)}
        >
          Unfiled
        </button>
        {rows.map(({ node, depth }) => (
          <button
            key={node.id}
            type="button"
            className="note-menu-item"
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            aria-current={currentNotebookId === node.id ? "true" : undefined}
            onClick={() => onPick(node.id)}
          >
            {node.name}
          </button>
        ))}
      </div>
    </Modal>
  );
}
