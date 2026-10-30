import type { FormEvent } from "react";
import type { Note } from "../db/notes";
import type { SharePermission } from "../db/shares";
import type { Tag, TagSummary } from "../db/tags";
import { clampMenuLeft } from "../lib/clampMenuLeft";
import { formatDate, formatRelativeTime } from "../lib/format";
import type { NotebookNode } from "../lib/notebooks";
import { ownerShareBadge, permissionLabel } from "../lib/shares";

interface NoteMetaRowProps {
  note: Note | null;
  notebookId: string | null;
  notebookOptions: { node: NotebookNode; depth: number }[];
  canManage: boolean;
  isTrashed: boolean;
  isOwner: boolean;
  shareCount: number;
  ownerName: string | null;
  sharePermission: SharePermission | null;
  noteTags: Tag[];
  allTags: TagSummary[];
  onChangeNotebook: (notebookId: string | null) => void;
  onToggleTag: (tag: TagSummary) => void;
}

export default function NoteMetaRow({
  note,
  notebookId,
  notebookOptions,
  canManage,
  isTrashed,
  isOwner,
  shareCount,
  ownerName,
  sharePermission,
  noteTags,
  allTags,
  onChangeNotebook,
  onToggleTag,
}: NoteMetaRowProps) {
  // The menu is positioned against its picker, which in a narrow editor column
  // can sit close enough to the edge that the menu would poke past the
  // scroller — that would make the note scroll sideways. Slide it back inside
  // when it opens; the offset is measured from the picker, the clamp from the
  // scroller the note now scrolls in.
  const fitTagMenu = (event: FormEvent<HTMLDetailsElement>) => {
    const details = event.currentTarget;
    const menu = details.querySelector<HTMLElement>(".tag-picker-menu");
    const scroller = details.closest<HTMLElement>(".editor-body");
    if (!menu) return;

    menu.style.left = "";
    if (!details.open || !scroller) return;

    const rect = menu.getBoundingClientRect();
    const leftInScroller = rect.left - scroller.getBoundingClientRect().left;
    const clamped = clampMenuLeft(leftInScroller, rect.width, scroller.clientWidth);
    menu.style.left = `${clamped - leftInScroller}px`;
  };

  return (
    <div className="editor-meta-row">
      <label className="notebook-control">
        <span className="sr-only">Notebook</span>
        <select
          value={notebookId ?? ""}
          disabled={!canManage || isTrashed}
          onChange={(event) => onChangeNotebook(event.target.value || null)}
        >
          <option value="">Unfiled</option>
          {notebookOptions.map(({ node, depth }) => (
            <option key={node.id} value={node.id}>
              {"— ".repeat(depth)}
              {node.name}
            </option>
          ))}
        </select>
      </label>

      <details className="tag-picker" onToggle={fitTagMenu}>
        <summary>
          {noteTags.length > 0 ? (
            noteTags.map((tag) => (
              <span key={tag.id} className="tag-chip">
                {tag.name}
              </span>
            ))
          ) : (
            <span className="muted">Add tags</span>
          )}
        </summary>
        <div className="tag-picker-menu">
          {allTags.length === 0 ? (
            <p className="muted">No tags yet. Create one in Manage tags.</p>
          ) : (
            allTags.map((tag) => (
              <label key={tag.id} className="tag-option">
                <input
                  type="checkbox"
                  checked={noteTags.some((item) => item.id === tag.id)}
                  disabled={!note || !canManage || isTrashed}
                  onChange={() => onToggleTag(tag)}
                />
                <span>{tag.name}</span>
                <span className="tag-count">{tag.note_count}</span>
              </label>
            ))
          )}
        </div>
      </details>

      {note && !isTrashed && isOwner && shareCount > 0 ? (
        <span className="badge share">{ownerShareBadge(shareCount)}</span>
      ) : null}

      {note && !isTrashed && !isOwner ? (
        <>
          <span className="badge share">
            Shared by {ownerName ?? "the owner"}
          </span>
          <span className="badge permission">
            {permissionLabel(sharePermission)}
          </span>
        </>
      ) : null}

      {note ? (
        <span className="editor-meta">
          Edited {formatRelativeTime(note.updated_at)} · Created{" "}
          {formatDate(note.created_at)}
        </span>
      ) : (
        <span className="editor-meta">New note</span>
      )}
    </div>
  );
}
