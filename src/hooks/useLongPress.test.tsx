import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPress, type HoldPoint } from "./useLongPress";

const DELAY = 500;
const START: HoldPoint = { x: 100, y: 200 };

function pointer(type: string, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
}

function press(target: Element, init: MouseEventInit = {}) {
  target.dispatchEvent(
    pointer("pointerdown", { clientX: START.x, clientY: START.y, ...init })
  );
}

function move(x: number, y: number) {
  window.dispatchEvent(pointer("pointermove", { clientX: x, clientY: y }));
}

function release(x = START.x, y = START.y) {
  const event = pointer("pointerup", { clientX: x, clientY: y });
  window.dispatchEvent(event);
  return event;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function setup(enabled = true) {
  const onLift = vi.fn();
  const onDrag = vi.fn();
  const onRelease = vi.fn();
  const onCancel = vi.fn();

  const host = document.createElement("div");
  document.body.append(host);

  const view = renderHook(() =>
    useLongPress({
      ref: { current: host },
      onLift,
      onDrag,
      onRelease,
      onCancel,
      delayMs: DELAY,
      tolerance: 8,
      enabled,
    })
  );

  return { onLift, onDrag, onRelease, onCancel, host, view };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useLongPress", () => {
  it("lifts the item when the press is held still past the delay", () => {
    const { onLift, host } = setup();

    press(host);
    advance(DELAY);

    expect(onLift).toHaveBeenCalledExactlyOnceWith(START);
  });

  it("stays quiet for a plain tap", () => {
    const { onLift, onRelease, host } = setup();

    press(host);
    advance(DELAY - 100);
    release();

    advance(DELAY);
    expect(onLift).not.toHaveBeenCalled();
    expect(onRelease).not.toHaveBeenCalled();
  });

  it("treats movement before the delay as a scroll and gives up", () => {
    const { onLift, onCancel, host } = setup();

    press(host);
    move(START.x + 40, START.y);
    advance(DELAY);

    expect(onLift).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ignores pointer jitter inside the tolerance", () => {
    const { onLift, host } = setup();

    press(host);
    move(START.x + 3, START.y - 4);
    advance(DELAY);

    expect(onLift).toHaveBeenCalledOnce();
  });

  it("reports a drag once a lifted item moves", () => {
    const { onLift, onDrag, onRelease, host } = setup();

    press(host);
    advance(DELAY);
    expect(onLift).toHaveBeenCalledOnce();

    move(START.x + 3, START.y);
    expect(onDrag).not.toHaveBeenCalled();

    move(START.x + 60, START.y + 40);
    expect(onDrag).toHaveBeenCalled();
    expect(onDrag).toHaveBeenLastCalledWith({ x: START.x + 60, y: START.y + 40 });

    release(START.x + 60, START.y + 40);
    expect(onRelease).toHaveBeenCalledExactlyOnceWith(
      { x: START.x + 60, y: START.y + 40 },
      true
    );
  });

  it("reports a plain release as a request for the menu", () => {
    const { onDrag, onRelease, host } = setup();

    press(host);
    advance(DELAY);
    release();

    expect(onDrag).not.toHaveBeenCalled();
    expect(onRelease).toHaveBeenCalledExactlyOnceWith(START, false);
  });

  it("cancels a lifted item when the gesture is interrupted", () => {
    const { onRelease, onCancel, host } = setup();

    press(host);
    advance(DELAY);
    window.dispatchEvent(pointer("pointercancel", {}));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onRelease).not.toHaveBeenCalled();

    advance(DELAY);
    expect(onRelease).not.toHaveBeenCalled();
  });

  it("cancels a lifted item when the page scrolls under it", () => {
    const { onCancel, onRelease, host } = setup();

    press(host);
    advance(DELAY);
    window.dispatchEvent(pointer("scroll", {}));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onRelease).not.toHaveBeenCalled();
  });

  it("claims the gesture from the scroller once lifted", () => {
    const { host } = setup();

    press(host);
    advance(DELAY);

    const touchmove = new Event("touchmove", { bubbles: true, cancelable: true });
    window.dispatchEvent(touchmove);
    expect(touchmove.defaultPrevented).toBe(true);
  });

  it("does not block scrolling before the lift", () => {
    const { host } = setup();

    press(host);
    const touchmove = new Event("touchmove", { bubbles: true, cancelable: true });
    window.dispatchEvent(touchmove);

    expect(touchmove.defaultPrevented).toBe(false);
  });

  it("swallows the mouse events that follow a lift", () => {
    const { onLift, host } = setup();

    press(host);
    advance(DELAY);
    expect(onLift).toHaveBeenCalledOnce();

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
    const { onLift, onRelease, host } = setup(false);

    press(host);
    advance(DELAY);
    expect(onLift).not.toHaveBeenCalled();

    release();
    expect(onRelease).not.toHaveBeenCalled();

    const click = pointer("click", { cancelable: true });
    host.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });
});
