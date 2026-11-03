import { useCallback, useEffect, useRef, useState } from "react";

export type NoteMode = "view" | "edit";

export interface UseNoteModeOptions {
  /** `null` while the route is still the "new note" placeholder. */
  noteId: string | null;
  /** Readers must never reach edit mode, even if the UI asks for it. */
  canEdit: boolean;
}

export interface NoteModeControls {
  mode: NoteMode;
  enterEdit: () => void;
  enterView: () => void;
  /** Tells the hook that a freshly created note should keep editing. */
  markCreated: (createdNoteId: string) => void;
}

/**
 * View/edit mode follows the note being opened, not the last mode the reader
 * chose: an existing note opens for reading, the new-note route opens for
 * writing, and only a note this session just created stays in edit mode across
 * its route change. Losing edit permission drops straight back to view.
 */
export function useNoteMode({
  noteId,
  canEdit,
}: UseNoteModeOptions): NoteModeControls {
  const [mode, setMode] = useState<NoteMode>(noteId === null ? "edit" : "view");
  const createdId = useRef<string | null>(null);

  useEffect(() => {
    if (noteId === null) {
      setMode("edit");
      return;
    }
    if (createdId.current === noteId) {
      createdId.current = null;
      // A new note keeps whatever mode the editor is in: normally edit, but a
      // Done pressed while the first save finished must not bounce back.
      return;
    }
    setMode("view");
  }, [noteId]);

  useEffect(() => {
    if (!canEdit) setMode("view");
  }, [canEdit]);

  const enterEdit = useCallback(() => {
    if (canEdit) setMode("edit");
  }, [canEdit]);

  const enterView = useCallback(() => setMode("view"), []);

  const markCreated = useCallback((createdNoteId: string) => {
    createdId.current = createdNoteId;
  }, []);

  return { mode, enterEdit, enterView, markCreated };
}
