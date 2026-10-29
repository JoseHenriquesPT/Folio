import { useEffect, useRef, type FormEvent } from "react";
import { decideLinkChoice, type LinkChoice } from "../lib/linkUrl";
import Modal from "./Modal";

/**
 * In-app replacement for the browser's link prompt. The form subtree mounts
 * fresh on every open, so the field always starts from `initialValue`.
 */
export default function LinkDialog({
  open,
  initialValue,
  onDecide,
}: {
  open: boolean;
  initialValue: string;
  onDecide: (choice: LinkChoice) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Modal focuses its own panel after mount; this runs afterwards so the
  // caret lands in the field with the old URL selected.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  function cancel() {
    onDecide({ action: "cancel" });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const field = inputRef.current;
    if (!field) return;
    onDecide(decideLinkChoice(field.value));
  }

  return (
    <Modal open={open} title="Add link" onClose={cancel}>
      <form className="link-form" onSubmit={handleSubmit}>
        <div className="inline-form">
          <input
            ref={inputRef}
            type="text"
            name="url"
            defaultValue={initialValue}
            placeholder="https://"
            aria-label="Link URL"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="dialog-actions">
          <button type="button" className="button ghost" onClick={cancel}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Apply
          </button>
        </div>
      </form>
    </Modal>
  );
}
