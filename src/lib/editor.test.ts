import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorExtensions } from "./editor";

let editor: Editor | null = null;

const TASK_LIST_HTML =
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li></ul>';

function roundTrip(html: string): string {
  editor = new Editor({ extensions: createEditorExtensions(), content: html });
  return editor.getHTML();
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("editor HTML round-trip", () => {
  it("keeps headings, paragraphs, and inline formatting", () => {
    const html = roundTrip(
      "<h1>Title</h1><p><strong>Bold</strong> and <em>italic</em></p>"
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("keeps bullet and ordered lists", () => {
    const html = roundTrip(
      "<ul><li><p>One</p></li></ul><ol><li><p>Two</p></li></ol>"
    );
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li><p>One</p></li>");
  });

  it("keeps task lists and checked state", () => {
    const html = roundTrip(TASK_LIST_HTML);
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="true"');
  });

  // The live editor DOM is built by TipTap's node view, not by renderHTML, so
  // it must be asserted separately: styles and paste parsing key on the same
  // attributes the serialized HTML carries.
  it("stamps task items with data-type in the live editor DOM", () => {
    editor = new Editor({
      extensions: createEditorExtensions(),
      content: TASK_LIST_HTML,
    });
    const item = editor.view.dom.querySelector("ul[data-type='taskList'] > li");
    expect(item).not.toBeNull();
    expect(item?.getAttribute("data-type")).toBe("taskItem");
    expect(item?.getAttribute("data-checked")).toBe("true");
    expect(item?.querySelector("label")).not.toBeNull();
    expect(item?.querySelector("div")).not.toBeNull();
  });

  it("keeps code blocks and inline code", () => {
    const html = roundTrip(
      "<pre><code>const answer = 42;</code></pre><p>Use <code>npm</code></p>"
    );
    expect(html).toContain("<pre><code>const answer = 42;</code></pre>");
    expect(html).toContain("<code>npm</code>");
  });

  it("keeps tables with header cells", () => {
    const html = roundTrip(
      "<table><tbody><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></tbody></table>"
    );
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("Name");
  });

  it("keeps links", () => {
    const html = roundTrip(
      '<p><a href="https://example.com">Example</a></p>'
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("Example");
  });

  it("keeps images", () => {
    const html = roundTrip(
      '<p><img src="https://example.com/photo.png" alt="Photo"></p>'
    );
    expect(html).toContain('src="https://example.com/photo.png"');
    expect(html).toContain('alt="Photo"');
  });
});

describe("task checkboxes while reading", () => {
  /**
   * Mirrors the browser's checkbox activation: checkedness flips first, then
   * the change event reaches TipTap's node view. jsdom's click() skips the
   * latter, so the event is dispatched by hand.
   */
  function toggleFirstCheckbox(instance: Editor): HTMLInputElement {
    const input = instance.view.dom.querySelector<HTMLInputElement>(
      'ul[data-type="taskList"] input[type="checkbox"]'
    );
    expect(input).not.toBeNull();
    input!.checked = !input!.checked;
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    return input!;
  }

  function readOnlyEditor(canToggle: () => boolean): Editor {
    const instance = new Editor({
      extensions: createEditorExtensions({ canToggleTaskItems: canToggle }),
      content: TASK_LIST_HTML,
      editable: false,
    });
    editor = instance;
    return instance;
  }

  // Reading mode keeps the editor non-editable, so TipTap's node view rolls
  // the checkbox back; the host writes the change into the document itself.
  // Reading the box from the DOM rather than a callback node is what keeps
  // the second toggle working after the first replaces the node.
  it("writes a checkbox change into a read-only document", () => {
    const instance = readOnlyEditor(() => true);

    let updates = 0;
    instance.on("update", () => {
      updates += 1;
    });

    const input = toggleFirstCheckbox(instance);

    expect(updates).toBe(1);
    expect(input.checked).toBe(false);
    expect(instance.getHTML()).toContain('data-checked="false"');
    expect(
      instance.view.dom.querySelector("li")?.getAttribute("data-checked")
    ).toBe("false");
  });

  it("keeps toggling from the state the page currently shows", () => {
    const instance = readOnlyEditor(() => true);

    const input = toggleFirstCheckbox(instance);
    expect(input.checked).toBe(false);

    toggleFirstCheckbox(instance);

    expect(input.checked).toBe(true);
    expect(instance.getHTML()).toContain('data-checked="true"');
  });

  it("leaves the checkbox and document untouched when the host refuses", () => {
    const instance = readOnlyEditor(() => false);

    const input = toggleFirstCheckbox(instance);

    expect(input.checked).toBe(true);
    expect(instance.getHTML()).toContain('data-checked="true"');
  });

  it("asks the host on every click instead of caching permission", () => {
    let allowed = true;
    const instance = readOnlyEditor(() => allowed);

    const input = toggleFirstCheckbox(instance);
    expect(input.checked).toBe(false);

    allowed = false;
    toggleFirstCheckbox(instance);

    expect(input.checked).toBe(false);
    expect(instance.getHTML()).toContain('data-checked="false"');
  });

  it("toggles nested task items without touching their parent", () => {
    const instance = new Editor({
      extensions: createEditorExtensions({ canToggleTaskItems: () => true }),
      content:
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Parent</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Child</p></li></ul></li></ul>',
      editable: false,
    });
    editor = instance;

    const boxes = instance.view.dom.querySelectorAll<HTMLInputElement>(
      'ul[data-type="taskList"] input[type="checkbox"]'
    );
    expect(boxes).toHaveLength(2);
    boxes[1]!.checked = true;
    boxes[1]!.dispatchEvent(new Event("change", { bubbles: true }));

    const items = instance.view.dom.querySelectorAll(
      'li[data-type="taskItem"]'
    );
    expect(items[0]?.getAttribute("data-checked")).toBe("false");
    expect(items[1]?.getAttribute("data-checked")).toBe("true");
  });

  it("leaves editable checkboxes to TipTap's own handling", () => {
    const instance = new Editor({
      extensions: createEditorExtensions({ canToggleTaskItems: () => false }),
      content: TASK_LIST_HTML,
    });
    editor = instance;

    const input = toggleFirstCheckbox(instance);

    expect(input.checked).toBe(false);
    expect(instance.getHTML()).toContain('data-checked="false"');
  });
});
