import { useEditorState, type Editor } from "@tiptap/react";
import type { ReactNode } from "react";

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`toolbar-button${active ? " active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function EditorToolbar({
  editor,
  disabled,
}: {
  editor: Editor | null;
  disabled: boolean;
}) {
  const state = useEditorState({
    editor,
    selector: (context) => {
      const instance = context.editor;
      if (!instance) return null;
      return {
        bold: instance.isActive("bold"),
        italic: instance.isActive("italic"),
        strike: instance.isActive("strike"),
        code: instance.isActive("code"),
        h1: instance.isActive("heading", { level: 1 }),
        h2: instance.isActive("heading", { level: 2 }),
        h3: instance.isActive("heading", { level: 3 }),
        bulletList: instance.isActive("bulletList"),
        orderedList: instance.isActive("orderedList"),
        taskList: instance.isActive("taskList"),
        blockquote: instance.isActive("blockquote"),
        codeBlock: instance.isActive("codeBlock"),
        link: instance.isActive("link"),
        canUndo: instance.can().undo(),
        canRedo: instance.can().redo(),
      };
    },
  });

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const answer = window.prompt("Link URL", previous ?? "https://");
    if (answer === null) return;

    if (!answer.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    const href = /^(https?:|mailto:|#|\/)/i.test(answer)
      ? answer
      : `https://${answer}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  const disabledAll = disabled || !editor || !state;

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <div className="toolbar-group">
        <ToolButton
          label="Heading 1"
          active={state?.h1}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolButton>
        <ToolButton
          label="Heading 2"
          active={state?.h2}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolButton>
        <ToolButton
          label="Heading 3"
          active={state?.h3}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolButton>
      </div>

      <span className="toolbar-divider" aria-hidden="true" />

      <div className="toolbar-group">
        <ToolButton
          label="Bold"
          active={state?.bold}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolButton>
        <ToolButton
          label="Italic"
          active={state?.italic}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          active={state?.strike}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </ToolButton>
        <ToolButton
          label="Inline code"
          active={state?.code}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          {"</>"}
        </ToolButton>
        <ToolButton
          label="Link"
          active={state?.link}
          disabled={disabledAll}
          onClick={setLink}
        >
          Link
        </ToolButton>
      </div>

      <span className="toolbar-divider" aria-hidden="true" />

      <div className="toolbar-group">
        <ToolButton
          label="Bullet list"
          active={state?.bulletList}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={state?.orderedList}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolButton>
        <ToolButton
          label="Task list"
          active={state?.taskList}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        >
          ☑ List
        </ToolButton>
        <ToolButton
          label="Quote"
          active={state?.blockquote}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </ToolButton>
        <ToolButton
          label="Code block"
          active={state?.codeBlock}
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          Code
        </ToolButton>
      </div>

      <span className="toolbar-divider" aria-hidden="true" />

      <div className="toolbar-group">
        <ToolButton
          label="Horizontal rule"
          disabled={disabledAll}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          —
        </ToolButton>
        <ToolButton
          label="Insert table"
          disabled={disabledAll}
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          Table
        </ToolButton>
      </div>

      <span className="toolbar-divider" aria-hidden="true" />

      <div className="toolbar-group">
        <ToolButton
          label="Undo"
          disabled={disabledAll || !state?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          ↶
        </ToolButton>
        <ToolButton
          label="Redo"
          disabled={disabledAll || !state?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          ↷
        </ToolButton>
      </div>
    </div>
  );
}
