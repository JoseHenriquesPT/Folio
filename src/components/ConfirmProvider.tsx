import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ConfirmOptions } from "../lib/confirm";

export type { ConfirmOptions };

interface PendingConfirm extends ConfirmOptions {
  resolve: (answer: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * In-app replacement for `window.confirm`: one dialog at a time, extra
 * requests queue behind it so no caller is ever left awaiting forever.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const queueRef = useRef<PendingConfirm[]>([]);
  const activeRef = useRef<PendingConfirm | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState<PendingConfirm | null>(null);
  const titleId = useId();
  const messageId = useId();

  const showNext = useCallback(() => {
    if (activeRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      const previouslyFocused = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
      return;
    }

    if (!restoreFocusRef.current && document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement;
    }
    activeRef.current = next;
    setActive(next);
  }, []);

  const settle = useCallback(
    (answer: boolean) => {
      const request = activeRef.current;
      if (!request) return;
      activeRef.current = null;
      setActive(null);
      request.resolve(answer);
      showNext();
    },
    [showNext]
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        queueRef.current.push({ ...options, resolve });
        showNext();
      }),
    [showNext]
  );

  // A caller whose dialog never settles would hang forever, so settle on exit.
  useEffect(
    () => () => {
      const request = activeRef.current;
      activeRef.current = null;
      request?.resolve(false);
      for (const queued of queueRef.current.splice(0)) queued.resolve(false);
    },
    []
  );

  useEffect(() => {
    if (!active) return;

    const focusTarget = active.tone === "danger" ? cancelRef : confirmRef;
    focusTarget.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        settle(false);
        return;
      }
      if (event.key !== "Tab") return;

      // Two controls only: keep Tab cycling between them.
      const insideDialog = document.activeElement;
      if (event.shiftKey && insideDialog === cancelRef.current) {
        event.preventDefault();
        confirmRef.current?.focus();
      } else if (!event.shiftKey && insideDialog === confirmRef.current) {
        event.preventDefault();
        cancelRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, settle]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  if (!active) {
    return (
      <ConfirmContext.Provider value={value}>{children}</ConfirmContext.Provider>
    );
  }

  const tone = active.tone ?? "primary";

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <div className="modal-backdrop confirm-backdrop" onMouseDown={() => settle(false)}>
        <div
          className="modal confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={messageId}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="modal-head">
            <h2 id={titleId}>{active.title}</h2>
          </header>
          <div className="modal-body">
            <p id={messageId} className="confirm-message">
              {active.message}
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="button ghost"
                ref={cancelRef}
                onClick={() => settle(false)}
              >
                {active.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className={`button ${tone === "danger" ? "danger" : "primary"}`}
                ref={confirmRef}
                onClick={() => settle(true)}
              >
                {active.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue["confirm"] {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error("useConfirm must be used inside ConfirmProvider");
  return value.confirm;
}
