import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";

export const editorExtensions = [
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
  Image.configure({ inline: false, allowBase64: false }),
  TableKit.configure({ table: { resizable: false } }),
];
