import { useContext, useRef } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../auth/session";
import type { NoteSummary } from "../db/notes";
import { useLongPress } from "../hooks/useLongPress";
import { useNoteDrag } from "../hooks/useNoteDrag";
import { planDrop, type DropPlan } from "../lib/dragNote";
import { formatRelativeTime, noteTitle, snippet } from "../lib/format";
import { noteMenuItems, type NoteMenuItem } from "../lib/noteMenu";
import { ownerShareBadge, permissionLabel } from "../lib/shares";
import type { NoteActionAnchor } from "./NoteActionMenu";
import { SidebarDrawerContext } from "./SidebarDrawerContext";
import { useWorkspace } from "./WorkspaceProvider";

/** What a card reports when its menu should open. */
export type NoteActionsHandler = (
  note: NoteSummary,
  anchor: NoteActionAnchor,
  items: NoteMenuItem[]
) => void;

/** What a card reports when a held note lands somewhere. */
export type NoteDropHandler = (note: NoteSummary, plan: DropPlan) => void;

export default function NoteCard({
  note,
  mode,
  hrefSearch,
  onActions,
  onDrop,
}: {
  note: NoteSummary;
  mode: "cards" | "list";
  hrefSearch: string;
  onActions: NoteActionsHandler;
  onDrop: NoteDropHandler;
}) {
  const session = useSession();
  const { notebooks } = useWorkspace();
  const drawer = useContext(SidebarDrawerContext);
  const notebook = note.notebook_id
    ? notebooks.find((item) => item.id === note.notebook_id)
    : null;
  const visibleTags = note.tags.slice(0, 3);
  const hiddenTags = note.tags.length - visibleTags.length;
  const sharedWithMe = note.owner_id !== session.user.id;
  const ownerBadge = ownerShareBadge(note.share_count);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const menuItems = noteMenuItems(note, session.user.id);
  const menuEnabled = menuItems.length > 0;
  const drag = useNoteDrag({
    cardRef,
    label: noteTitle(note.title),
    drawerOpen: drawer?.open,
    onDrawerOpenChange: drawer?.setOpen,
  });

  useLongPress({
    ref: cardRef,
    enabled: menuEnabled,
    onLift: drag.lift,
    onDrag: drag.move,
    onCancel: drag.cancel,
    onRelease: (point, dragged) => {
      if (!dragged) {
        // Held still and let go: put the card back and ask for the menu.
        drag.cancel();
        onActions(note, point, menuItems);
        return;
      }

      // finish() always tidies the lift away, with or without a target.
      const target = drag.finish(point);
      if (!target) return;
      onDrop(note, planDrop(note, target));
    },
  });

  return (
    <Link
      ref={cardRef}
      to={`/note/${note.id}${hrefSearch ? `?${hrefSearch}` : ""}`}
      className={`note-card ${mode}`}
      aria-label={noteTitle(note.title)}
      onContextMenu={(event) => {
        // Shift keeps the browser's own menu, here as everywhere else.
        if (event.shiftKey || !menuEnabled) return;
        event.preventDefault();
        onActions(note, { x: event.clientX, y: event.clientY }, menuItems);
      }}
    >
      <div className="note-card-top">
        <h3>{noteTitle(note.title)}</h3>
        {note.pinned ? (
          <span className="badge pin" title="Pinned">
            Pin
          </span>
        ) : null}
      </div>

      <p className="note-snippet">{snippet(note.body_text)}</p>

      <div className="note-card-meta">
        <span className="note-time">{formatRelativeTime(note.updated_at)}</span>
        {mode === "list" && notebook ? (
          <span className="note-notebook">{notebook.name}</span>
        ) : null}
      </div>

      {visibleTags.length > 0 || note.share_count > 0 || note.attachment_count > 0 ? (
        <div className="note-card-foot">
          <span className="note-tags">
            {visibleTags.map((tag) => (
              <span key={tag.id} className="tag-chip">
                {tag.name}
              </span>
            ))}
            {hiddenTags > 0 ? (
              <span className="tag-chip muted">+{hiddenTags}</span>
            ) : null}
          </span>
          <span className="note-badges">
            {sharedWithMe ? (
              <>
                <span className="badge share">
                  Shared by {note.owner_display_name ?? "the owner"}
                </span>
                <span className="badge permission">
                  {permissionLabel(note.my_share_permission)}
                </span>
              </>
            ) : ownerBadge ? (
              <span className="badge share">{ownerBadge}</span>
            ) : null}
            {note.attachment_count > 0 ? (
              <span className="badge">
                {note.attachment_count} file{note.attachment_count === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </Link>
  );
}
