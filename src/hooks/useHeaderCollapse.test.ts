import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHeaderCollapse } from "./useHeaderCollapse";

function makeHeaderWithFocus(): () => void {
  const header = document.createElement("header");
  header.className = "editor-header";
  const input = document.createElement("input");
  header.append(input);
  document.body.append(header);
  input.focus();
  return () => header.remove();
}

describe("useHeaderCollapse", () => {
  it("collapses after scrolling down past the fold", () => {
    const { result } = renderHook(() => useHeaderCollapse());

    act(() => result.current.handleScroll(120));
    expect(result.current.collapsed).toBe(true);
  });

  it("stays expanded near the top of the note", () => {
    const { result } = renderHook(() => useHeaderCollapse());

    act(() => result.current.handleScroll(40));
    expect(result.current.collapsed).toBe(false);
  });

  it("expands again when scrolling up", () => {
    const { result } = renderHook(() => useHeaderCollapse());

    act(() => result.current.handleScroll(200));
    expect(result.current.collapsed).toBe(true);

    act(() => result.current.handleScroll(140));
    expect(result.current.collapsed).toBe(false);
  });

  it("never collapses while focus sits in the header", () => {
    const cleanup = makeHeaderWithFocus();
    const { result } = renderHook(() => useHeaderCollapse());

    act(() => result.current.handleScroll(400));
    expect(result.current.collapsed).toBe(false);

    cleanup();
  });

  it("reset clears the tracked position and re-expands", () => {
    const { result } = renderHook(() => useHeaderCollapse());

    act(() => result.current.handleScroll(300));
    expect(result.current.collapsed).toBe(true);

    act(() => result.current.reset());
    expect(result.current.collapsed).toBe(false);

    // The next scroll is measured from zero again: a small nudge from the
    // fresh position must not count as "still deep in the note".
    act(() => result.current.handleScroll(10));
    expect(result.current.collapsed).toBe(false);
  });
});
