import type { AutosaveStatus } from "../lib/autosave";
import { saveStatusView } from "../lib/saveStatus";

/**
 * Fixed-size status mark. The width never changes with the wording, so the
 * phone header cannot reflow while a save starts or finishes.
 */
export default function SaveIndicator({
  status,
  hasNote,
}: {
  status: AutosaveStatus;
  hasNote: boolean;
}) {
  const view = saveStatusView({ status, hasNote });
  if (view.tone === "idle") return null;

  return (
    <span
      className={`save-indicator ${view.tone}`}
      data-status={view.tone}
      aria-hidden="true"
      title={view.label}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false">
        {view.tone === "saving" ? (
          <circle
            className="save-spinner"
            cx="10"
            cy="10"
            r="7"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : null}

        {view.tone === "saved" ? (
          <path
            d="M5 10.5l3.2 3.2L15 7"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {view.tone === "dirty" ? <circle cx="10" cy="10" r="3.4" /> : null}

        {view.tone === "error" || view.tone === "conflict" ? (
          <>
            <path
              d="M10 3.6l6.2 11.2H3.8L10 3.6z"
              fill="none"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M10 8v3.4"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="10" cy="13.8" r="0.9" />
          </>
        ) : null}
      </svg>
    </span>
  );
}
