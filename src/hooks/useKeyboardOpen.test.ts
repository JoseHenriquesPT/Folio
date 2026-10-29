import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useKeyboardOpen } from "./useKeyboardOpen";

type FakeViewport = EventTarget & { height: number };

function setWindow({ width, height }: { width: number; height: number }): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function setVisualViewport(height: number | null): FakeViewport | null {
  if (height === null) {
    Reflect.deleteProperty(window, "visualViewport");
    return null;
  }
  const viewport: FakeViewport = Object.assign(new EventTarget(), { height });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  return viewport;
}

function resizeWindow(): void {
  window.dispatchEvent(new Event("resize"));
}

describe("useKeyboardOpen", () => {
  it("opens when the layout viewport loses the keyboard's height on a phone", () => {
    setWindow({ width: 390, height: 800 });
    setVisualViewport(null);
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);

    // interactive-widget=resizes-content: the keyboard takes height out of the
    // layout viewport without touching its width.
    act(() => {
      setWindow({ width: 390, height: 460 });
      resizeWindow();
    });
    expect(result.current).toBe(true);

    act(() => {
      setWindow({ width: 390, height: 800 });
      resizeWindow();
    });
    expect(result.current).toBe(false);
  });

  it("ignores a window resize that changes the width as well", () => {
    setWindow({ width: 390, height: 800 });
    setVisualViewport(null);
    const { result } = renderHook(() => useKeyboardOpen());

    // Dragging the window's edge shorter is not the keyboard, and the next
    // measurement starts from the window's new shape.
    act(() => {
      setWindow({ width: 380, height: 500 });
      resizeWindow();
    });
    expect(result.current).toBe(false);

    act(() => {
      setWindow({ width: 380, height: 300 });
      resizeWindow();
    });
    expect(result.current).toBe(true);
  });

  it("never opens on a desktop-sized layout", () => {
    setWindow({ width: 1200, height: 900 });
    setVisualViewport(null);
    const { result } = renderHook(() => useKeyboardOpen());

    act(() => {
      setWindow({ width: 1200, height: 500 });
      resizeWindow();
    });
    expect(result.current).toBe(false);
  });

  it("reads the keyboard from the visual viewport when the layout does not move", () => {
    // iOS overlays the keyboard instead of resizing the layout viewport.
    setWindow({ width: 390, height: 800 });
    const viewport = setVisualViewport(800);
    const { result } = renderHook(() => useKeyboardOpen());

    act(() => {
      viewport!.height = 470;
      viewport!.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(true);

    act(() => {
      viewport!.height = 800;
      viewport!.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(false);
  });

  it("treats a small height change as noise, not the keyboard", () => {
    setWindow({ width: 390, height: 800 });
    setVisualViewport(null);
    const { result } = renderHook(() => useKeyboardOpen());

    // A collapsing URL bar or a hand on the screen edge loses far less height
    // than an on-screen keyboard does.
    act(() => {
      setWindow({ width: 390, height: 740 });
      resizeWindow();
    });
    expect(result.current).toBe(false);
  });
});
