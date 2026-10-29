import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useContextMenuSuppress } from "./useContextMenuSuppress";

function fireContextMenu(target: Element): MouseEvent {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function mount(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host.firstElementChild ?? host;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useContextMenuSuppress", () => {
  it("cancels the native context menu on app elements", () => {
    renderHook(() => useContextMenuSuppress());
    const card = mount('<a class="note-card" href="/note/1">Title</a>');

    expect(fireContextMenu(card).defaultPrevented).toBe(true);
  });

  it("lets the native menu through for editable fields and Shift", () => {
    renderHook(() => useContextMenuSuppress());
    const input = mount('<input aria-label="Title">');
    expect(fireContextMenu(input).defaultPrevented).toBe(false);

    const card = mount('<a class="note-card" href="/note/2">Title</a>');
    const withShift = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    });
    card.dispatchEvent(withShift);
    expect(withShift.defaultPrevented).toBe(false);
  });

  it("stops listening once the component unmounts", () => {
    const view = renderHook(() => useContextMenuSuppress());
    view.unmount();

    const card = mount('<a class="note-card" href="/note/3">Title</a>');
    expect(fireContextMenu(card).defaultPrevented).toBe(false);
  });
});
