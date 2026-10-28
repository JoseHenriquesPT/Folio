import type { ChangeEvent } from "react";
import type { JoplinImportController } from "../hooks/useJoplinImport";
import { formatCount } from "../lib/format";
import Modal from "./Modal";
import ProgressMeter from "./ProgressMeter";

interface JoplinImportDialogProps {
  open: boolean;
  onClose: () => void;
  controller: JoplinImportController;
}

function reportLine(controller: JoplinImportController): string {
  const result = controller.result;
  if (!result) return "";
  return `Imported ${formatCount(result.notes, "note")}, ${formatCount(
    result.notebooks,
    "notebook"
  )}, ${formatCount(result.attachments, "attachment")}.`;
}

export default function JoplinImportDialog({
  open,
  onClose,
  controller,
}: JoplinImportDialogProps) {
  const { running, phase, completed, total, plan, result, failures, error } =
    controller;

  function close() {
    if (running) return;
    controller.reset();
    onClose();
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void controller.preview(file);
  }

  return (
    <Modal open={open} title="Import from Joplin" onClose={close}>
      {result ? (
        <div className="import-report">
          <p>{reportLine(controller)}</p>
          {result.cancelled ? (
            <p className="muted">The import stopped early; it kept what it created.</p>
          ) : null}
          <p className="muted">
            Everything landed in the notebook “{result.rootNotebookName}”.
          </p>

          {failures.length > 0 ? (
            <ul className="report-list">
              {failures.map((failure) => (
                <li key={`${failure.kind}-${failure.name}`}>
                  <strong>{failure.name}</strong>
                  <span className="muted"> — {failure.message}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <button type="button" className="button primary" onClick={close}>
            Done
          </button>
        </div>
      ) : (
        <>
          <p className="muted">
            Choose the <code>.jex</code> file exported by Joplin. Notes,
            notebooks, and attachments come across; nothing is written until you
            press Import.
          </p>

          <label className="field-label" htmlFor="joplin-file">
            Joplin export (.jex)
          </label>
          <input
            id="joplin-file"
            type="file"
            accept=".jex,application/x-tar"
            disabled={running}
            onChange={chooseFile}
          />

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          {running ? (
            <ProgressMeter
              label={phase === "reading" ? "Reading the archive…" : "Importing notes…"}
              ariaLabel="Import progress"
              completed={completed}
              total={total}
              cancelLabel="Cancel import"
              onCancel={controller.cancel}
            />
          ) : plan ? (
            <div className="import-preview">
              <p>
                {formatCount(plan.counts.notes, "note")},{" "}
                {formatCount(plan.counts.notebooks, "notebook")},{" "}
                {formatCount(plan.counts.resources, "attachment")}
              </p>

              {plan.counts.rewrittenLinks > 0 ? (
                <p className="muted">
                  {formatCount(plan.counts.rewrittenLinks, "link")} rewritten
                </p>
              ) : null}

              {plan.warnings.length > 0 ? (
                <ul className="report-list">
                  {plan.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              {plan.skipped.length > 0 ? (
                <details className="import-skipped">
                  <summary>{formatCount(plan.skipped.length, "skipped item")}</summary>
                  <ul className="report-list">
                    {plan.skipped.map((item) => (
                      <li key={item.path}>
                        <strong>{item.path}</strong>
                        <span className="muted"> — {item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className="data-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => void controller.run()}
                >
                  Import {formatCount(plan.counts.notes, "note")}
                </button>
                <button type="button" className="button ghost" onClick={close}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
