import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPress } from "./useLongPress";

const DELAY = 500;
const START = { x: 100, y: 200 };

function pointer(type: string, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
}

function press(target: Element, init: MouseEventInit = {}) {
  target.dispatchEvent(
    pointer("pointerdown", { clientX: START.x, clientY: START.y, ...init })
  );
}

function move(target: Window, x: number, y: number) {
  target.dispatchEvent(pointer("pointermove", { clientX: x, clientY: y }));
}

function release(target: Window) {
  target.dispatchEvent(pointer("pointerup", {}));
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function setup(delayMs = DELAY, enabled = true) {
  const onActivate = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const ref = { current: host };

  const view = renderHook(() =>
    useLongPress({ ref, onActivate, delayMs, tolerance: 8, enabled })
  );

  return { onActivate, host, view };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useLongPress", () => {
  it("activates with the press point after the delay", () => {
    const { onActivate, host } = setup();

    press(host);
    advance(DELAY);

    expect(onActivate).toHaveBeenCalledExactlyOnceWith(START);
  });

  it("stays quiet for a plain tap", () => {
    const { onActivate, host } = setup();

    press(host);
    advance(DELAY - 100);
    release(window);

    advance(DELAY);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("cancels once the pointer travels beyond the tolerance", () => {
    const { onActivate, host } = setup();

    press(host);
    move(window, START.x + 20, START.y);
    advance(DELAY);

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("ignores pointer jitter inside the tolerance", () => {
    const { onActivate, host } = setup();

    press(host);
    move(window, START.x + 3, START.y - 4);
    advance(DELAY);

    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("cancels when the gesture is interrupted", () => {
    const { onActivate, host } = setup();

    press(host);
    window.dispatchEvent(pointer("pointercancel", {}));
    advance(DELAY);

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("cancels when the page scrolls under the press", () => {
    const { onActivate, host } = setup();

    press(host);
    window.dispatchEvent(pointer("scroll", {}));
    advance(DELAY);

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("swallows the mouse events that follow an activation", () => {
    const { onActivate, host } = setup();

    press(host);
    advance(DELAY);
    expect(onActivate).toHaveBeenCalledOnce();

    for (const type of ["mousedown", "mouseup", "click"]) {
      const event = pointer(type, { cancelable: true });
      host.dispatchEvent(event);
      expect(event.defaultPrevented, `${type} should be swallowed`).toBe(true);
    }

    // The flag clears so a later deliberate click still works.
    const laterClick = pointer("click", { cancelable: true });
    host.dispatchEvent(laterClick);
    expect(laterClick.defaultPrevented).toBe(false);
  });

  it("leaves ordinary clicks alone", () => {
    const { host } = setup();

    const click = pointer("click", { cancelable: true });
    host.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
  });

  it("does nothing at all when disabled", () => {
    const { onActivate, host } = setup(DELAY, false);

    press(host);
    advance(DELAY);
    expect(onActivate).not.toHaveBeenCalled();

    const click = pointer("click", { cancelable: true });
    host.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });
});
