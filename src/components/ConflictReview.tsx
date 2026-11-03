import { htmlToPlainText, sanitizeHtml } from "../lib/sanitize";

export interface ConflictVersion {
  title: string;
  bodyHtml: string;
}

export interface ConflictReviewProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  busy: boolean;
  local: ConflictVersion;
  server: ConflictVersion | null;
  onClose: () => void;
  onRetry: () => void;
  onKeepMine: () => void;
  onUseServer: () => void;
}

function VersionBody({ version }: { version: ConflictVersion }) {
  if (htmlToPlainText(version.bodyHtml).length === 0) {
    return <p className="muted">This version has no text.</p>;
  }

  return (
    <div
      className="conflict-body"
      // Bodies are stored sanitized; the local side comes straight from the
      // editable document, so sanitize again rather than trusting the editor.
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(version.bodyHtml) }}
    />
  );
}

/**
 * The expanded conflict view: the whole local draft beside the whole server
 * copy, so the reader can decide without losing either. A diff-first view is
 * on the roadmap; this ships the full comparison.
 */
export default function ConflictReview({
  open,
  loading,
  error,
  busy,
  local,
  server,
  onClose,
  onRetry,
  onKeepMine,
  onUseServer,
}: ConflictReviewProps) {
  if (!open) return null;

  return (
    <section className="conflict-review" aria-label="Conflict review">
      <header className="conflict-review-head">
        <div>
          <h3>Review changes</h3>
          <p className="muted">
            Both versions are kept until you choose one.
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close conflict review"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="conflict-columns">
        <section className="conflict-version" aria-label="Your version">
          <h4>Your version</h4>
          <p className="conflict-title">{local.title || "Untitled note"}</p>
          <VersionBody version={local} />
        </section>

        <section className="conflict-version" aria-label="Server version">
          <h4>Server version</h4>
          {loading ? (
            <p className="muted" role="status">
              Loading the server version…
            </p>
          ) : error ? (
            <>
              <p role="alert">{error}</p>
              <button type="button" className="button small" onClick={onRetry}>
                Try again
              </button>
            </>
          ) : server ? (
            <>
              <p className="conflict-title">
                {server.title || "Untitled note"}
              </p>
              <VersionBody version={server} />
            </>
          ) : null}
        </section>
      </div>

      <div className="dialog-actions conflict-actions">
        <button
          type="button"
          className="button primary"
          onClick={onKeepMine}
          disabled={busy}
        >
          Keep mine
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={onUseServer}
          disabled={busy || loading || !server}
        >
          Use server version
        </button>
      </div>
    </section>
  );
}
