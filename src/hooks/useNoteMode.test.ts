import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNoteMode } from "./useNoteMode";

interface Props {
  noteId: string | null;
  canEdit: boolean;
}

function setup(initialProps: Props) {
  return renderHook((props: Props) => useNoteMode(props), {
    initialProps,
  });
}

describe("useNoteMode", () => {
  it("opens an existing note in view mode", () => {
    const { result } = setup({ noteId: "note-1", canEdit: true });

    expect(result.current.mode).toBe("view");
  });

  it("opens a new note in edit mode", () => {
    const { result } = setup({ noteId: null, canEdit: true });

    expect(result.current.mode).toBe("edit");
  });

  it("stays in edit mode when a new note is created", () => {
    const { result, rerender } = setup({ noteId: null, canEdit: true });

    act(() => result.current.markCreated("created-note"));
    rerender({ noteId: "created-note", canEdit: true });

    expect(result.current.mode).toBe("edit");
  });

  it("returns to view mode when another note opens", () => {
    const { result, rerender } = setup({ noteId: "note-1", canEdit: true });
    act(() => result.current.enterEdit());

    rerender({ noteId: "note-2", canEdit: true });

    expect(result.current.mode).toBe("view");
  });

  it("returns to edit mode when the new-note route opens", () => {
    const { result, rerender } = setup({ noteId: "note-1", canEdit: true });

    rerender({ noteId: null, canEdit: true });

    expect(result.current.mode).toBe("edit");
  });

  it("cannot enter edit mode without permission", () => {
    const { result } = setup({ noteId: "note-1", canEdit: false });

    act(() => result.current.enterEdit());

    expect(result.current.mode).toBe("view");
  });

  it("leaves edit mode when permission is removed", () => {
    const { result, rerender } = setup({ noteId: "note-1", canEdit: true });
    act(() => result.current.enterEdit());

    rerender({ noteId: "note-1", canEdit: false });

    expect(result.current.mode).toBe("view");
  });

  it("can swap between view and edit once permission exists", () => {
    const { result } = setup({ noteId: "note-1", canEdit: true });

    act(() => result.current.enterEdit());
    expect(result.current.mode).toBe("edit");

    act(() => result.current.enterView());
    expect(result.current.mode).toBe("view");
  });
});
