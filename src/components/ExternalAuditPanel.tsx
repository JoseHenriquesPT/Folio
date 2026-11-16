import type { ApiAuditController } from "../hooks/useApiAudit";
import { auditTarget, auditToolLabel } from "../lib/apiAudit";
import { formatRelativeTime } from "../lib/format";
import { useConfirm } from "./ConfirmProvider";

interface ExternalAuditPanelProps {
  controller: ApiAuditController;
  now?: () => Date;
}

export default function ExternalAuditPanel({
  controller,
  now = () => new Date(),
}: ExternalAuditPanelProps) {
  const confirm = useConfirm();

  if (!controller.enabled) return null;

  async function undo(id: number, target: string) {
    const ok = await confirm({
      title: "Undo external change",
      message: `Restore “${target}” to its version before this external update? The current version will be replaced.`,
      confirmLabel: "Undo change",
      tone: "danger",
    });
    if (ok) await controller.undo(id);
  }

  return (
    <details className="audit-panel">
      <summary>Recent external changes ({controller.audit.length})</summary>

      {controller.error ? (
        <p className="form-error" role="alert">
          {controller.error}
        </p>
      ) : null}

      {controller.loading && controller.audit.length === 0 ? (
        <p className="muted">Loading recent changes…</p>
      ) : null}

      {!controller.loading && controller.audit.length === 0 ? (
        <p className="muted">No external changes yet.</p>
      ) : null}

      {controller.audit.length > 0 ? (
        <ul className="audit-list">
          {controller.audit.map((entry) => {
            const target = auditTarget(entry);
            return (
              <li className="audit-row" key={entry.id}>
                <div className="audit-row-head">
                  <span className="audit-target">{target}</span>
                  <span className="audit-meta">
                    {formatRelativeTime(entry.createdAt, now())}
                  </span>
                </div>
                <p className="audit-meta">
                  {auditToolLabel(entry.tool)} ·{" "}
                  {entry.tokenName ?? "Deleted token"}
                  {entry.noteIds.length > 0
                    ? ` · ${entry.noteIds.length} ${
                        entry.noteIds.length === 1 ? "note" : "notes"
                      }`
                    : ""}
                </p>
                {entry.canUndo ? (
                  <button
                    type="button"
                    className="button ghost small"
                    disabled={controller.busyId !== null}
                    onClick={() => void undo(entry.id, target)}
                  >
                    {controller.busyId === entry.id ? "Undoing…" : "Undo"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </details>
  );
}
