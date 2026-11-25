import { Extension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";

export interface EditorExtensionOptions {
  /**
   * Whether a task checkbox may be toggled while the editor is read-only,
   * which is how reading mode renders a note. Editable editors always keep
   * TipTap's own checkbox handling.
   */
  canToggleTaskItems?: () => boolean;
}

function isChecked(item: Element): boolean {
  return item.getAttribute("data-checked") === "true";
}

function taskItemAt(
  view: EditorView,
  item: Element
): { node: ProseMirrorNode; pos: number } | null {
  // Offset 0 of the node view's li lands at the start of its content, which
  // resolves to the task item itself.
  const resolved = view.state.doc.resolve(view.posAtDOM(item, 0));
  if (resolved.parent.type.name !== "taskItem") return null;
  return { node: resolved.parent, pos: resolved.before() };
}

/**
 * A read-only task checkbox still fires change, but TipTap's node view springs
 * it back because it only rewrites the document on editable editors. The
 * reading-mode host decides whether the account may edit this note; when it
 * may, the click is written into the document, which flows into autosave.
 * The checkbox element is resolved from the current DOM instead of TipTap's
 * callback node, which goes stale after the first change.
 */
function toggleReadOnlyTaskItem(
  view: EditorView,
  target: EventTarget | null,
  canToggle: () => boolean
): boolean {
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
    return false;
  }
  if (view.editable) return false;

  const item = target.closest('li[data-type="taskItem"]');
  if (!item || !view.dom.contains(item)) return false;

  if (!canToggle()) {
    target.checked = isChecked(item);
    return false;
  }

  const at = taskItemAt(view, item);
  if (!at) {
    target.checked = isChecked(item);
    return false;
  }

  view.dispatch(
    view.state.tr.setNodeMarkup(at.pos, undefined, {
      ...at.node.attrs,
      checked: !at.node.attrs.checked,
    })
  );
  return true;
}

function readOnlyTaskItems(canToggle: () => boolean) {
  return Extension.create({
    name: "readOnlyTaskItems",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handleDOMEvents: {
              change: (view, event) =>
                toggleReadOnlyTaskItem(view, event.target, canToggle),
            },
          },
        }),
      ];
    },
  });
}

export function createEditorExtensions(
  options: EditorExtensionOptions = {}
) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        markdownLinks: true,
      },
    }),
    Placeholder.configure({ placeholder: "Start writing…" }),
    TaskList,
    // TipTap v3's task-item node view builds the li without data-type, so the
    // live DOM diverges from the serialized HTML; stamping it keeps styles,
    // copy/paste, and paste parsing working on what the editor renders.
    TaskItem.configure({
      nested: true,
      HTMLAttributes: { "data-type": "taskItem" },
    }),
    readOnlyTaskItems(options.canToggleTaskItems ?? (() => false)),
    Image.configure({ inline: false, allowBase64: false }),
    TableKit.configure({ table: { resizable: false } }),
  ];
}
