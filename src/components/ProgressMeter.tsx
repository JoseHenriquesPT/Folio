interface ProgressMeterProps {
  label: string;
  ariaLabel: string;
  completed: number;
  total: number;
  cancelLabel: string;
  onCancel: () => void;
}

/**
 * The running state shared by the export panels and the import dialog: the
 * phase being worked on, a percentage of the items done, and a way out.
 */
export default function ProgressMeter({
  label,
  ariaLabel,
  completed,
  total,
  cancelLabel,
  onCancel,
}: ProgressMeterProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="data-progress" aria-live="polite">
      <p className="muted">{label}</p>

      {total > 0 ? (
        <>
          <div
            className="storage-meter"
            role="progressbar"
            aria-label={ariaLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="muted">
            {completed} of {total}
          </p>
        </>
      ) : null}

      <button type="button" className="button small ghost" onClick={onCancel}>
        {cancelLabel}
      </button>
    </div>
  );
}
