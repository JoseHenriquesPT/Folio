import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  AUTOSAVE_DELAY_MS,
  AUTOSAVE_MAX_WAIT_MS,
  autosaveReducer,
  initialAutosaveState,
  isDirty,
  snapshotsEqual,
  type AutosaveSnapshot,
} from "../lib/autosave";
import { SaveNoteError, type SaveNoteFailure } from "../db/notes";

export interface UseAutosaveOptions {
  initialVersion: number;
  /** Quiet period after the last change. */
  delayMs?: number;
  /** A continuous typing stretch still writes at least this often. */
  maxWaitMs?: number;
  save: (snapshot: AutosaveSnapshot) => Promise<number>;
  onDirty?: (snapshot: AutosaveSnapshot) => void;
  onSaved?: (version: number, pending: boolean) => void;
  onError?: (kind: SaveNoteFailure, snapshot: AutosaveSnapshot) => void;
  /** Called when a flush found the content already matching the server. */
  onUnchanged?: () => void;
}

export function useAutosave({
  initialVersion,
  delayMs = AUTOSAVE_DELAY_MS,
  maxWaitMs = AUTOSAVE_MAX_WAIT_MS,
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
  // A conflict means every automatic write would fail with the same stale
  // version. Keep the draft local until the conflict panel resolves it.
  const paused = useRef(false);
  // When the current dirty stretch began, so continuous typing cannot postpone
  // a save forever.
  const dirtySince = useRef<number | null>(null);

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

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const scheduleAt = useCallback(
    (waitMs: number) => {
      if (paused.current) return;
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        void flushRef.current();
      }, Math.max(0, waitMs));
    },
    [clearTimer]
  );

  const scheduleQuietPeriod = useCallback(() => {
    if (paused.current) return;
    const now = Date.now();
    if (dirtySince.current === null) dirtySince.current = now;
    const deadline = dirtySince.current + maxWaitMs;
    const due = Math.min(now + delayMs, deadline);
    scheduleAt(due - now);
  }, [delayMs, maxWaitMs, scheduleAt]);

  const flush = useCallback(async () => {
    clearTimer();

    if (!latest.current) return;
    if (paused.current) return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }

    const snapshot = latest.current;

    // No-op guard: the content ends where the server already is, so skip the
    // request entirely and report "saved" without touching any version.
    if (snapshotsEqual(snapshot, baseline.current)) {
      latest.current = null;
      dirtySince.current = null;
      dispatch({ type: "unchanged" });
      onUnchangedRef.current?.();
      return;
    }

    inFlight.current = true;
    dirtySince.current = null;
    dispatch({ type: "save-started" });

    try {
      const version = await saveRef.current(snapshot);
      const pending = latest.current !== snapshot;
      if (!pending) latest.current = null;
      baseline.current = snapshot;
      paused.current = false;
      dispatch({ type: "saved", version });
      onSavedRef.current?.(version, pending);
      if (pending) queued.current = true;
    } catch (error) {
      const kind =
        error instanceof SaveNoteError ? error.kind : ("unknown" as const);
      // The write did not land: forget the baseline so the next flush cannot
      // mistake local content for content the server still has.
      baseline.current = null;
      paused.current = kind === "conflict";
      dirtySince.current = null;
      dispatch({ type: "failed", kind });
      onErrorRef.current?.(kind, snapshot);
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void flushRef.current();
      }
    }
  }, [clearTimer]);

  flushRef.current = flush;

  const change = useCallback(
    (snapshot: AutosaveSnapshot) => {
      latest.current = snapshot;
      dispatch({ type: "change" });
      onDirtyRef.current?.(snapshot);
      scheduleQuietPeriod();
    },
    [scheduleQuietPeriod]
  );

  const recover = useCallback(
    (snapshot: AutosaveSnapshot) => {
      latest.current = snapshot;
      dispatch({ type: "draft-recovered" });
      scheduleQuietPeriod();
    },
    [scheduleQuietPeriod]
  );

  const retry = useCallback(() => {
    paused.current = false;
    dirtySince.current = null;
    if (latest.current) void flushRef.current();
  }, []);

  const reset = useCallback(
    (version: number, syncedContent?: AutosaveSnapshot) => {
      clearTimer();
      latest.current = null;
      queued.current = false;
      paused.current = false;
      dirtySince.current = null;
      // An explicit baseline lets the next identical change skip its request;
      // without one, everything saves (unknown content must never be assumed).
      baseline.current = syncedContent ?? null;
      dispatch({ type: "reset", version });
    },
    [clearTimer]
  );

  const pending = useCallback(() => latest.current, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") void flushRef.current();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearTimer();
      // Leaving the editor should not strand the last quiet period. The write
      // is fire-and-forget: the draft remains the fallback if it fails.
      void flushRef.current();
    };
  }, [clearTimer]);

  return {
    state,
    dirty: isDirty(state),
    change,
    recover,
    retry,
    reset,
    flush,
    pending,
  };
}
