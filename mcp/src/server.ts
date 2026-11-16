import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { htmlToMarkdown } from "../../src/lib/markdown";
import {
  FolioApiError,
  type NoteRecord,
  type ReadApi,
  type WriteApi,
} from "./api";
import { markdownToSafeHtml } from "./markdown";

const MAX_CHARS_DEFAULT = 40_000;
const MAX_CHARS_LIMIT = 100_000;

function textResult(value: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(value, null, 2) },
    ],
  };
}

function errorResult(error: unknown) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text:
          error instanceof FolioApiError
            ? error.message
            : "Folio could not complete the request.",
      },
    ],
  };
}

async function run<T>(fn: () => Promise<T>) {
  try {
    return textResult(await fn());
  } catch (error) {
    return errorResult(error);
  }
}

function noteResult(note: NoteRecord, bodyMarkdown: string, truncated: boolean) {
  return {
    id: note.id,
    title: note.title,
    version: note.version,
    notebook_id: note.notebook_id,
    notebook_name: note.notebook_name,
    tags: note.tags,
    pinned: note.pinned,
    archived: note.archived,
    created_at: note.created_at,
    updated_at: note.updated_at,
    attachments: note.attachments,
    body_markdown: bodyMarkdown,
    truncated,
  };
}

export function createFolioServer(api: ReadApi & WriteApi): McpServer {
  const server = new McpServer({ name: "folio", version: "0.1.0" });

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description:
        "Search the notes this account can read. Returns title, snippet, notebook, tags, version and timestamps. Archived notes are excluded by default; trashed notes are never returned.",
      inputSchema: {
        query: z.string().min(1).describe("Words to search for."),
        notebook_id: z
          .uuid()
          .optional()
          .describe("Only notes in this notebook id."),
        tag: z
          .string()
          .min(1)
          .optional()
          .describe("Only notes with this tag name."),
        include_archived: z
          .boolean()
          .optional()
          .describe("Include archived notes."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum results (1-50, default 20)."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(() => api.searchNotes(args))
  );

  server.registerTool(
    "get_note",
    {
      title: "Read note",
      description:
        "Read one note as Markdown with its metadata, tags and attachment file names. Inline attachment references are listed in attachments and are not downloadable through this tool.",
      inputSchema: {
        note_id: z
          .uuid()
          .describe("The note id from search_notes or list_notes."),
        max_chars: z
          .number()
          .int()
          .min(1_000)
          .max(MAX_CHARS_LIMIT)
          .optional()
          .describe("Maximum Markdown characters to return (default 40000)."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(async () => {
        const note = await api.getNote(args.note_id);
        const markdown = htmlToMarkdown(note.body_html);
        const maxChars = args.max_chars ?? MAX_CHARS_DEFAULT;
        const truncated = markdown.length > maxChars;
        const bodyMarkdown = truncated
          ? `${markdown.slice(0, maxChars)}\n\n[Truncated]`
          : markdown;
        return noteResult(note, bodyMarkdown, truncated);
      })
  );

  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description:
        "List the notes this account can read, newest first, with pagination. Filter by notebook id or tag. Archived notes are excluded by default; trashed notes are never returned.",
      inputSchema: {
        notebook_id: z
          .uuid()
          .optional()
          .describe("Only notes in this notebook id."),
        tag: z
          .string()
          .min(1)
          .optional()
          .describe("Only notes with this tag name."),
        include_archived: z
          .boolean()
          .optional()
          .describe("Include archived notes."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Page size (1-100, default 30)."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Rows to skip (default 0)."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(() => api.listNotes(args))
  );

  server.registerTool(
    "list_notebooks",
    {
      title: "List notebooks",
      description:
        "List the notebooks this account can read. parent_id reconstructs the tree; a shared notebook whose parent is not readable appears at the root. Shared rows carry the owner's display name and note counts.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => api.listNotebooks())
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description:
        "List the account's tags and their note counts. Tags are owner-only; a shared note does not expose the other account's tags.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => api.listTags())
  );

  server.registerTool(
    "get_vault_overview",
    {
      title: "Vault overview",
      description:
        "Summarize the account's vault: active, archived and trashed owned notes, shared-with-me notes, notebook counts, tags and attachment usage.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => api.getVaultOverview())
  );

  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description:
        "Create a note in an owned notebook. The body is Markdown and is sanitized with the editor allowlist before storage. Requires a write-scoped token.",
      inputSchema: {
        title: z.string().max(500).optional().describe("Note title."),
        body_markdown: z
          .string()
          .max(1_000_000)
          .optional()
          .describe("Note body as Markdown."),
        notebook_id: z
          .uuid()
          .optional()
          .describe("Owned notebook id; omit for Unfiled."),
        tags: z
          .array(z.string().min(1).max(60))
          .max(20)
          .optional()
          .describe("Tag names, matched case-insensitively."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) =>
      run(async () => {
        if (!args.title?.trim() && !args.body_markdown?.trim()) {
          throw new FolioApiError("Give the note a title or body.");
        }
        return api.createNote({
          title: args.title,
          body_html: args.body_markdown
            ? markdownToSafeHtml(args.body_markdown)
            : "",
          notebook_id: args.notebook_id,
          tags: args.tags,
        });
      })
  );

  server.registerTool(
    "update_note",
    {
      title: "Update note",
      description:
        "Update a note's title and/or Markdown body. expected_version comes from get_note; a stale version is rejected. mode replace, append or prepend. Requires a write-scoped token.",
      inputSchema: {
        note_id: z.uuid().describe("The note id."),
        expected_version: z
          .number()
          .int()
          .min(1)
          .describe("The note version last read."),
        title: z.string().max(500).optional().describe("New title."),
        body_markdown: z
          .string()
          .max(1_000_000)
          .optional()
          .describe("Markdown body for replace, append or prepend."),
        mode: z
          .enum(["replace", "append", "prepend"])
          .optional()
          .describe("How to apply the body (default replace)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) =>
      run(async () => {
        const mode = args.mode ?? "replace";
        if (args.title === undefined && args.body_markdown === undefined) {
          throw new FolioApiError("Give the note a title or body to update.");
        }
        if (mode !== "replace" && !args.body_markdown?.trim()) {
          throw new FolioApiError(
            "body_markdown is required for append or prepend."
          );
        }

        let bodyHtml: string | undefined;
        if (args.body_markdown !== undefined) {
          if (mode === "replace") {
            bodyHtml = markdownToSafeHtml(args.body_markdown);
          } else {
            const current = await api.getNote(args.note_id);
            const currentMarkdown = htmlToMarkdown(current.body_html);
            const combined =
              mode === "append"
                ? `${currentMarkdown}\n\n${args.body_markdown}`
                : `${args.body_markdown}\n\n${currentMarkdown}`;
            bodyHtml = markdownToSafeHtml(combined);
          }
        }

        return api.updateNote({
          note_id: args.note_id,
          expected_version: args.expected_version,
          title: args.title,
          body_html: bodyHtml,
        });
      })
  );

  server.registerTool(
    "move_notes",
    {
      title: "Move notes",
      description:
        "Move owned notes to a notebook, or to Unfiled with notebook_id null. Owner-only. Requires a write-scoped token.",
      inputSchema: {
        note_ids: z.array(z.uuid()).min(1).max(100),
        notebook_id: z
          .uuid()
          .nullable()
          .optional()
          .describe("Owned notebook id, or null for Unfiled."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) =>
      run(() => api.moveNotes(args.note_ids, args.notebook_id ?? null))
  );

  server.registerTool(
    "add_tags",
    {
      title: "Add tags",
      description:
        "Add tags to owned notes. Names are matched case-insensitively and created on demand. Owner-only. Requires a write-scoped token.",
      inputSchema: {
        note_ids: z.array(z.uuid()).min(1).max(100),
        tags: z.array(z.string().min(1).max(60)).min(1).max(20),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => run(() => api.addTags(args.note_ids, args.tags))
  );

  server.registerTool(
    "remove_tags",
    {
      title: "Remove tags",
      description:
        "Remove tag links from owned notes. The tag itself remains. Owner-only. Requires a write-scoped token.",
      inputSchema: {
        note_ids: z.array(z.uuid()).min(1).max(100),
        tags: z.array(z.string().min(1).max(60)).min(1).max(20),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => run(() => api.removeTags(args.note_ids, args.tags))
  );

  server.registerTool(
    "create_notebook",
    {
      title: "Create notebook",
      description:
        "Create a notebook under an owned parent, or at the root. Owner-only. Requires a write-scoped token.",
      inputSchema: {
        name: z.string().min(1).max(120),
        parent_id: z
          .uuid()
          .nullable()
          .optional()
          .describe("Owned parent notebook id, or null for the root."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) =>
      run(() => api.createNotebook(args.name, args.parent_id ?? null))
  );

  server.registerTool(
    "rename_notebook",
    {
      title: "Rename notebook",
      description:
        "Rename an owned notebook. Owner-only. Requires a write-scoped token.",
      inputSchema: {
        notebook_id: z.uuid(),
        name: z.string().min(1).max(120),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) =>
      run(() => api.renameNotebook(args.notebook_id, args.name))
  );

  return server;
}
