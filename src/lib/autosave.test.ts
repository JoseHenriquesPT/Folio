import { describe, expect, it } from "vitest";
import {
  autosaveReducer,
  initialAutosaveState,
  isDirty,
  type AutosaveState,
} from "./autosave";

function reduce(...events: Parameters<typeof autosaveReducer>[1][]): AutosaveState {
  return events.reduce(autosaveReducer, initialAutosaveState(4));
}

describe("autosaveReducer", () => {
  it("starts idle at the server version", () => {
    expect(initialAutosaveState(4)).toEqual({
      status: "idle",
      version: 4,
      savedVersion: 4,
      errorKind: null,
    });
  });

  it("marks changes dirty", () => {
    expect(reduce({ type: "change" }).status).toBe("dirty");
  });

  it("moves through saving to saved", () => {
    const state = reduce(
      { type: "change" },
      { type: "save-started" },
      { type: "saved", version: 5 }
    );
    expect(state).toEqual({
      status: "saved",
      version: 5,
      savedVersion: 5,
      errorKind: null,
    });
  });

  it("keeps dirty after an error", () => {
    const state = reduce(
      { type: "change" },
      { type: "save-started" },
      { type: "failed", kind: "unknown" }
    );
    expect(state.status).toBe("error");
    expect(state.errorKind).toBe("unknown");
    expect(isDirty(state)).toBe(true);
  });

  it("surfaces a version conflict", () => {
    const state = reduce(
      { type: "change" },
      { type: "save-started" },
      { type: "failed", kind: "conflict" }
    );
    expect(state.status).toBe("conflict");
    expect(state.errorKind).toBe("conflict");
    expect(isDirty(state)).toBe(true);
  });

  it("becomes dirty again after a successful save", () => {
    const state = reduce(
      { type: "change" },
      { type: "save-started" },
      { type: "saved", version: 5 },
      { type: "change" }
    );
    expect(state.status).toBe("dirty");
    expect(state.version).toBe(5);
  });

  it("recovers a draft as dirty", () => {
    const state = reduce({ type: "draft-recovered" });
    expect(state.status).toBe("dirty");
    expect(isDirty(state)).toBe(true);
  });

  it("discards local changes", () => {
    const state = reduce({ type: "change" }, { type: "discard" });
    expect(state.status).toBe("idle");
    expect(isDirty(state)).toBe(false);
  });

  it("resets to a new server version", () => {
    const state = reduce(
      { type: "change" },
      { type: "failed", kind: "conflict" },
      { type: "reset", version: 9 }
    );
    expect(state).toEqual({
      status: "idle",
      version: 9,
      savedVersion: 9,
      errorKind: null,
    });
  });
});

describe("isDirty", () => {
  it("is false only for idle and saved", () => {
    expect(isDirty(initialAutosaveState(1))).toBe(false);
    expect(
      isDirty({ status: "saved", version: 2, savedVersion: 2, errorKind: null })
    ).toBe(false);
    for (const status of ["dirty", "saving", "error", "conflict"] as const) {
      expect(
        isDirty({ status, version: 1, savedVersion: 1, errorKind: null })
      ).toBe(true);
    }
  });
});
