import type { SaveNoteFailure } from "../db/notes";

export type AutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export interface AutosaveState {
  status: AutosaveStatus;
  version: number;
  savedVersion: number;
  errorKind: SaveNoteFailure | null;
}

export type AutosaveEvent =
  | { type: "change" }
  | { type: "save-started" }
  | { type: "saved"; version: number }
  | { type: "failed"; kind: SaveNoteFailure }
  | { type: "draft-recovered" }
  | { type: "discard" }
  | { type: "reset"; version: number };

export function initialAutosaveState(version: number): AutosaveState {
  return {
    status: "idle",
    version,
    savedVersion: version,
    errorKind: null,
  };
}

export function autosaveReducer(
  state: AutosaveState,
  event: AutosaveEvent
): AutosaveState {
  switch (event.type) {
    case "change":
    case "draft-recovered":
      return { ...state, status: "dirty", errorKind: null };
    case "save-started":
      return { ...state, status: "saving" };
    case "saved":
      return {
        status: "saved",
        version: event.version,
        savedVersion: event.version,
        errorKind: null,
      };
    case "failed":
      return {
        ...state,
        status: event.kind === "conflict" ? "conflict" : "error",
        errorKind: event.kind,
      };
    case "discard":
      return {
        ...state,
        status: "idle",
        version: state.savedVersion,
        errorKind: null,
      };
    case "reset":
      return initialAutosaveState(event.version);
  }
}

export function isDirty(state: AutosaveState): boolean {
  return state.status !== "idle" && state.status !== "saved";
}
