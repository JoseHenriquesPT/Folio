import type { VaultExportController } from "../hooks/useVaultExport";
import ProgressMeter from "./ProgressMeter";

interface ExportPanelProps {
  controller: VaultExportController;
}

function phaseLabel(phase: VaultExportController["phase"]): string {
  switch (phase) {
    case "loading":
      return "Collecting your notes…";
    case "downloading":
      return "Downloading attachments…";
    case "packing":
      return "Packing the archive…";
    default:
      return "";
  }
}

export default function ExportPanel({ controller }: ExportPanelProps) {
  const { running, phase, completed, total, error } = controller;

  return (
    <div className="data-panel">
      <p className="muted">
        The zip keeps your notebook folders, one Markdown file per note, the
        attachments, a manifest, and a README. The JSON backup holds the stored
        HTML for every note.
      </p>

      <div className="data-actions">
        <button
          type="button"
          className="button primary"
          disabled={running}
          onClick={() => void controller.start("vault")}
        >
          Download vault zip
        </button>
        <button
          type="button"
          className="button"
          disabled={running}
          onClick={() => void controller.start("json")}
        >
          Download JSON backup
        </button>
      </div>

      {running ? (
        <ProgressMeter
          label={phaseLabel(phase)}
          ariaLabel="Export progress"
          completed={completed}
          total={total}
          cancelLabel="Cancel export"
          onCancel={controller.cancel}
        />
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
