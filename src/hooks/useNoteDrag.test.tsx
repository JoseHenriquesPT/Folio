import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNoteDrag } from "./useNoteDrag";

const POINT = { x: 400, y: 300 };
const originalHit = document.elementFromPoint;

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

function row(kind: string, id: string, label: string): HTMLElement {
  const link = document.createElement("a");
  link.className = "sidebar-link";
  link.dataset.dropKind = kind;
  link.dataset.dropId = id;
  link.dataset.dropLabel = label;
  link.innerHTML = "<span>label</span>";
  document.body.append(link);
  return link;
}

function ghost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".note-ghost");
}

function pointAt(element: Element | null) {
  document.elementFromPoint = vi.fn(() => element) as Document["elementFromPoint"];
}

interface SetupOptions {
  label?: string;
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
}

function setup(options: SetupOptions = {}) {
  const card = mount('<a class="note-card" href="#"><h3>Shopping</h3></a>')
    .firstElementChild as HTMLElement;
  pointAt(null);

  const view = renderHook(() =>
    useNoteDrag({
      cardRef: { current: card },
      label: options.label ?? "Shopping",
      drawerOpen: options.drawerOpen,
      onDrawerOpenChange: options.onDrawerOpenChange,
    })
  );

  return { card, view };
}

afterEach(() => {
  document.body.innerHTML = "";
  document.elementFromPoint = originalHit;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
});

describe("useNoteDrag", () => {
  it("lifts a floating copy and dims the card it came from", () => {
    const { card, view } = setup();

    view.result.current.lift(POINT);

    expect(ghost()?.textContent).toBe("Shopping");
    expect(card.classList.contains("dragging")).toBe(true);
    view.result.current.cancel();
  });

  it("follows the pointer while dragging", () => {
    const { view } = setup();

    view.result.current.lift(POINT);
    view.result.current.move({ x: 640, y: 520 });

    expect(ghost()?.style.left).toBe("640px");
    expect(ghost()?.style.top).toBe("520px");
    view.result.current.cancel();
  });

  it("rings the row under the pointer and clears it when the pointer moves on", () => {
    const { view } = setup();
    const ideas = row("notebook", "notebook-1", "Ideas");

    view.result.current.lift(POINT);
    pointAt(ideas.firstElementChild);
    view.result.current.move({ x: 60, y: 200 });
    expect(ideas.classList.contains("drop-target")).toBe(true);

    pointAt(null);
    view.result.current.move({ x: 400, y: 200 });
    expect(ideas.classList.contains("drop-target")).toBe(false);
    view.result.current.cancel();
  });

  it("returns the row under the pointer when the drag finishes, and tidies up", () => {
    const { card, view } = setup();
    const recipes = row("tag", "tag-1", "recipes");

    view.result.current.lift(POINT);
    pointAt(recipes.firstElementChild);

    const target = view.result.current.finish({ x: 60, y: 400 });
    expect(target).toEqual({ kind: "tag", id: "tag-1", label: "recipes" });
    expect(ghost()).toBeNull();
    expect(recipes.classList.contains("drop-target")).toBe(false);
    expect(card.classList.contains("dragging")).toBe(false);
  });

  it("reports no target when the pointer is not over a drop row", () => {
    const { view } = setup();

    view.result.current.lift(POINT);
    expect(view.result.current.finish(POINT)).toBeNull();
    expect(ghost()).toBeNull();
  });

  it("cancelling tidies up without a target", () => {
    const { card, view } = setup();

    view.result.current.lift(POINT);
    view.result.current.cancel();

    expect(ghost()).toBeNull();
    expect(card.classList.contains("dragging")).toBe(false);
    expect(view.result.current.finish(POINT)).toBeNull();
  });

  it("keeps quiet when there is no app shell around to open", () => {
    const { view } = setup();
    expect(() => view.result.current.lift(POINT)).not.toThrow();
    view.result.current.cancel();
  });

  it("opens the phone drawer while dragging and closes it after", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const setOpen = vi.fn();
    const { view } = setup({ drawerOpen: false, onDrawerOpenChange: setOpen });

    view.result.current.lift(POINT);
    expect(setOpen).toHaveBeenCalledWith(true);

    view.result.current.cancel();
    expect(setOpen).toHaveBeenLastCalledWith(false);
  });
});
