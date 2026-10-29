import { afterEach, describe, expect, it } from "vitest";
import { shouldSuppressContextMenu } from "./contextMenu";

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shouldSuppressContextMenu", () => {
  it("hides the browser menu on ordinary app elements", () => {
    const host = mount(`
      <a class="note-card" href="/note/1"><h3>Title</h3><p>Snippet</p></a>
      <button>Pin</button>
      <div class="sidebar-link">Ideas</div>
    `);

    for (const target of host.querySelectorAll("*")) {
      expect(shouldSuppressContextMenu(target)).toBe(true);
    }
  });

  it("keeps the browser menu for editable fields", () => {
    const host = mount(`
      <input aria-label="Title">
      <textarea></textarea>
      <select><option>a</option></select>
      <div contenteditable="true"><p>typed</p></div>
    `);

    for (const target of host.querySelectorAll("input, textarea, select, p")) {
      expect(shouldSuppressContextMenu(target)).toBe(false);
    }
  });

  it("keeps the browser menu inside the note editor", () => {
    const host = mount(`
      <div class="ProseMirror"><p>A paragraph with <strong>bold</strong>.</p></div>
    `);

    const bold = host.querySelector("strong");
    expect(bold).toBeTruthy();
    expect(shouldSuppressContextMenu(bold)).toBe(false);
    expect(shouldSuppressContextMenu(host.querySelector("p"))).toBe(false);
  });

  it("keeps the browser menu on images so Save image stays available", () => {
    const host = mount(`<figure><img src="/x.png" alt="chart"></figure>`);

    expect(shouldSuppressContextMenu(host.querySelector("img"))).toBe(false);
  });

  it("never hides the menu while Shift is held", () => {
    const host = mount(`<a class="note-card" href="/note/1">Title</a>`);
    const card = host.querySelector("a");

    expect(shouldSuppressContextMenu(card, true)).toBe(false);
    expect(shouldSuppressContextMenu(card, false)).toBe(true);
  });

  it("leaves events without an element target alone", () => {
    expect(shouldSuppressContextMenu(null)).toBe(false);
    expect(shouldSuppressContextMenu(document)).toBe(false);
  });
});
