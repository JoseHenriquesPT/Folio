import type { ChangeEvent } from "react";
import type { ImportResult } from "../db/import";
import type { ImportController } from "../hooks/useImport";
import { formatCount } from "../lib/format";
import type { ImportFormat } from "../lib/importFormat";
import Modal from "./Modal";
import ProgressMeter from "./ProgressMeter";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  controller: ImportController;
}

const SOURCE_NAMES: Record<ImportFormat, string> = {
  joplin: "Joplin export",
  "folio-vault": "Folio vault zip",
  "folio-json": "Folio JSON backup",
};

function reportLine(result: ImportResult): string {
  const parts = [
    formatCount(result.notes, "note"),
    formatCount(result.notebooks, "notebook"),
    formatCount(result.attachments, "attachment"),
  ];
  if (result.tags > 0) parts.push(formatCount(result.tags, "tag"));

  return `Imported ${parts.join(", ")}.`;
}

export default function ImportDialog({
  open,
  onClose,
  controller,
}: ImportDialogProps) {
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
    <Modal open={open} title="Import notes" onClose={close}>
      {result ? (
        <div className="import-report">
          <p>{reportLine(result)}</p>
          {result.cancelled ? (
            <p className="muted">The import stopped early; it kept what it created.</p>
          ) : null}
          <p className="muted">
            Everything landed in the notebook “{result.rootNotebookName}”.
          </p>

          {failures.length > 0 ? (
            <ul className="report-list">
              {failures.map((failure, index) => (
                <li key={`${failure.kind}-${failure.name}-${index}`}>
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
            Choose a Joplin <code>.jex</code> export, a Folio vault{" "}
            <code>.zip</code>, or a Folio JSON backup. Notes, notebooks, tags,
            timestamps and files come across into one dated notebook; nothing
            existing is overwritten and nothing is written until you press
            Import.
          </p>

          <label className="field-label" htmlFor="import-file">
            Import file (.jex, .zip, .json)
          </label>
          <input
            id="import-file"
            type="file"
            accept=".jex,.zip,.json,application/x-tar,application/zip,application/json"
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
              label={phase === "reading" ? "Reading the file…" : "Importing notes…"}
              ariaLabel="Import progress"
              completed={completed}
              total={total}
              cancelLabel="Cancel import"
              onCancel={controller.cancel}
            />
          ) : plan ? (
            <div className="import-preview">
              <p>Detected a {SOURCE_NAMES[plan.source]}.</p>
              <p>
                {formatCount(plan.counts.notes, "note")},{" "}
                {formatCount(plan.counts.notebooks, "notebook")},{" "}
                {formatCount(plan.counts.attachments, "attachment")}
                {plan.counts.tags > 0
                  ? `, ${formatCount(plan.counts.tags, "tag")}`
                  : ""}
              </p>

              {plan.counts.linksRewritten > 0 ? (
                <p className="muted">
                  {formatCount(plan.counts.linksRewritten, "link")} rewritten
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
