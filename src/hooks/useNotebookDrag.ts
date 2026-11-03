import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NotebookRow } from "../db/database.types";
import {
  notebookDropZone,
  planNotebookDrop,
  type NotebookDropPlan,
  type NotebookDropZone,
} from "../lib/notebooks";

interface NotebookDragOptions {
  notebooks: NotebookRow[];
  /** Receives the complete new sibling order; the caller persists it. */
  onDrop: (plan: NotebookDropPlan) => void;
}

interface DragState {
  id: string;
  label: string;
  targetId: string | null;
  zone: NotebookDropZone;
  overRoot: boolean;
}

/**
 * Pointer-driven notebook drag. A dedicated grip means the row link keeps
 * navigating on phones while the grip starts a drag; move and drop previews
 * are applied imperatively so a row is not re-rendered on every move.
 */
export function useNotebookDrag({ notebooks, onDrop }: NotebookDragOptions) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const stateRef = useRef<DragState | null>(null);

  useEffect(
    () => () => {
      stopRef.current?.();
    },
    []
  );

  function start(
    event: ReactPointerEvent<HTMLElement>,
    notebookId: string,
    label: string
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    stopRef.current?.();

    const sourceRow = event.currentTarget.closest<HTMLElement>(
      "[data-notebook-row]"
    );
    const state: DragState = {
      id: notebookId,
      label,
      targetId: null,
      zone: "inside",
      overRoot: false,
    };
    stateRef.current = state;
    setDraggingId(notebookId);
    sourceRow?.classList.add("notebook-dragging");

    const ghost = document.createElement("div");
    ghost.className = "notebook-ghost";
    ghost.textContent = label;
    document.body.append(ghost);

    let hoverRow: HTMLElement | null = null;
    let hoverRoot: HTMLElement | null = null;

    const place = (x: number, y: number) => {
      ghost.style.left = `${x + 14}px`;
      ghost.style.top = `${y + 14}px`;
    };
    place(event.clientX, event.clientY);

    const clearHover = () => {
      hoverRow?.classList.remove("drop-before", "drop-inside", "drop-after");
      hoverRoot?.classList.remove("drop-root");
      hoverRow = null;
      hoverRoot = null;
    };

    const handleMove = (moveEvent: PointerEvent) => {
      place(moveEvent.clientX, moveEvent.clientY);

      const element = document.elementFromPoint?.(
        moveEvent.clientX,
        moveEvent.clientY
      );
      const row = element?.closest<HTMLElement>("[data-notebook-row]") ?? null;
      const root = element?.closest<HTMLElement>("[data-notebook-root]") ?? null;

      if (!row && !root) {
        state.targetId = null;
        state.overRoot = false;
        clearHover();
        return;
      }

      if (row) {
        const id = row.dataset.notebookId ?? null;
        const rect = row.getBoundingClientRect();
        const zone = notebookDropZone(
          moveEvent.clientY,
          rect.top,
          rect.height
        );
        if (row === hoverRow) {
          row.classList.remove("drop-before", "drop-inside", "drop-after");
        } else {
          clearHover();
          hoverRow = row;
        }
        row.classList.add(`drop-${zone}`);
        state.targetId = id;
        state.zone = zone;
        state.overRoot = false;
        return;
      }

      clearHover();
      hoverRoot = root;
      root?.classList.add("drop-root");
      state.targetId = null;
      state.zone = "inside";
      state.overRoot = true;
    };

    const stop = () => {
      clearHover();
      sourceRow?.classList.remove("notebook-dragging");
      ghost.remove();
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", handleKey);
      stateRef.current = null;
      stopRef.current = null;
      setDraggingId(null);
    };

    const cancel = () => {
      stop();
    };

    const handleUp = () => {
      const current = stateRef.current;
      const plan =
        current && (current.targetId || current.overRoot)
          ? planNotebookDrop(
              notebooks,
              current.id,
              current.targetId,
              current.zone
            )
          : null;
      stop();
      if (plan) onDrop(plan);
    };

    const handleKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") cancel();
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", handleKey);
    stopRef.current = stop;
  }

  return { draggingId, start };
}
