import type { AutosaveStatus } from "./autosave";

export type SaveTone =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export interface SaveStatusView {
  tone: SaveTone;
  /** Empty when there is nothing to report; used for the live region. */
  label: string;
}

/** The header draws this as an icon; the live region reads the label. */
export function saveStatusView({
  status,
  hasNote,
}: {
  status: AutosaveStatus;
  hasNote: boolean;
}): SaveStatusView {
  switch (status) {
    case "dirty":
      return { tone: "dirty", label: "Unsaved changes" };
    case "saving":
      return { tone: "saving", label: "Saving" };
    case "saved":
      return { tone: "saved", label: "Saved" };
    case "error":
      return { tone: "error", label: "Save failed" };
    case "conflict":
      return { tone: "conflict", label: "Conflict" };
    case "idle":
      return hasNote
        ? { tone: "saved", label: "Saved" }
        : { tone: "idle", label: "" };
  }
}
