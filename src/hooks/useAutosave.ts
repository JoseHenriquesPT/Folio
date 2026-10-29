import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  autosaveReducer,
  initialAutosaveState,
  isDirty,
  snapshotsEqual,
  type AutosaveSnapshot,
} from "../lib/autosave";
import { SaveNoteError, type SaveNoteFailure } from "../db/notes";

export interface UseAutosaveOptions {
  initialVersion: number;
  delayMs?: number;
  save: (snapshot: AutosaveSnapshot) => Promise<number>;
  onDirty?: (snapshot: AutosaveSnapshot) => void;
  onSaved?: (version: number, pending: boolean) => void;
  onError?: (kind: SaveNoteFailure, snapshot: AutosaveSnapshot) => void;
  /** Called when a flush found the content already matching the server. */
  onUnchanged?: () => void;
}

export function useAutosave({
  initialVersion,
  delayMs = 800,
  save,
  onDirty,
  onSaved,
  onError,
  onUnchanged,
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
  // Last content known to be on the server (seeded by reset, advanced on save).
  // A version conflict nulls it: after the server moves on, no local content
  // can be assumed to match, so the next flush always writes.
  const baseline = useRef<AutosaveSnapshot | null>(null);

  const saveRef = useRef(save);
  const onDirtyRef = useRef(onDirty);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  const onUnchangedRef = useRef(onUnchanged);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    saveRef.current = save;
    onDirtyRef.current = onDirty;
    onSavedRef.current = onSaved;
    onErrorRef.current = onError;
    onUnchangedRef.current = onUnchanged;
  }, [save, onDirty, onSaved, onError, onUnchanged]);

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

    const snapshot = latest.current;

    // No-op guard: the content ends where the server already is, so skip the
    // request entirely and report "saved" without touching any version.
    if (snapshotsEqual(snapshot, baseline.current)) {
      latest.current = null;
      dispatch({ type: "unchanged" });
      onUnchangedRef.current?.();
      return;
    }

    inFlight.current = true;
    dispatch({ type: "save-started" });

    try {
      const version = await saveRef.current(snapshot);
      const pending = latest.current !== snapshot;
      if (!pending) latest.current = null;
      baseline.current = snapshot;
      dispatch({ type: "saved", version });
      onSavedRef.current?.(version, pending);
      if (pending) queued.current = true;
    } catch (error) {
      const kind =
        error instanceof SaveNoteError ? error.kind : ("unknown" as const);
      // The write did not land: forget the baseline so the next flush cannot
      // mistake local content for content the server still has.
      baseline.current = null;
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

  const reset = useCallback(
    (version: number, syncedContent?: AutosaveSnapshot) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      latest.current = null;
      queued.current = false;
      // An explicit baseline lets the next identical change skip its request;
      // without one, everything saves (unknown content must never be assumed).
      baseline.current = syncedContent ?? null;
      dispatch({ type: "reset", version });
    },
    []
  );

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
