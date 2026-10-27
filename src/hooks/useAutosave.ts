import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  autosaveReducer,
  initialAutosaveState,
  isDirty,
} from "../lib/autosave";
import { SaveNoteError, type SaveNoteFailure } from "../db/notes";

export interface AutosaveSnapshot {
  title: string;
  bodyHtml: string;
}

export interface UseAutosaveOptions {
  initialVersion: number;
  delayMs?: number;
  save: (snapshot: AutosaveSnapshot) => Promise<number>;
  onDirty?: (snapshot: AutosaveSnapshot) => void;
  onSaved?: (version: number, pending: boolean) => void;
  onError?: (kind: SaveNoteFailure, snapshot: AutosaveSnapshot) => void;
}

export function useAutosave({
  initialVersion,
  delayMs = 800,
  save,
  onDirty,
  onSaved,
  onError,
}: UseAutosaveOptions) {
  const [state, dispatch] = useReducer(
    autosaveReducer,
    initialVersion,
    initialAutosaveState
  );

  const latest = useRef<AutosaveSnapshot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const queued = useRef(false);

  const saveRef = useRef(save);
  const onDirtyRef = useRef(onDirty);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    saveRef.current = save;
    onDirtyRef.current = onDirty;
    onSavedRef.current = onSaved;
    onErrorRef.current = onError;
  }, [save, onDirty, onSaved, onError]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (!latest.current) return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }

    inFlight.current = true;
    const snapshot = latest.current;
    dispatch({ type: "save-started" });

    try {
      const version = await saveRef.current(snapshot);
      const pending = latest.current !== snapshot;
      if (!pending) latest.current = null;
      dispatch({ type: "saved", version });
      onSavedRef.current?.(version, pending);
      if (pending) queued.current = true;
    } catch (error) {
      const kind =
        error instanceof SaveNoteError ? error.kind : ("unknown" as const);
      dispatch({ type: "failed", kind });
      onErrorRef.current?.(kind, snapshot);
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void flushRef.current();
      }
    }
  }, []);

  flushRef.current = flush;

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flushRef.current();
    }, delayMs);
  }, [delayMs]);

  const change = useCallback(
    (snapshot: AutosaveSnapshot) => {
      latest.current = snapshot;
      dispatch({ type: "change" });
      onDirtyRef.current?.(snapshot);
      schedule();
    },
    [schedule]
  );

  const recover = useCallback(
    (snapshot: AutosaveSnapshot) => {
      latest.current = snapshot;
      dispatch({ type: "draft-recovered" });
      schedule();
    },
    [schedule]
  );

  const retry = useCallback(() => {
    if (latest.current) void flushRef.current();
  }, []);

  const reset = useCallback((version: number) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    latest.current = null;
    queued.current = false;
    dispatch({ type: "reset", version });
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return {
    state,
    dirty: isDirty(state),
    change,
    recover,
    retry,
    reset,
    flush,
  };
}
