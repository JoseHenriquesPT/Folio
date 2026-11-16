import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import {
  FolioApiError,
  type CreateNoteInput,
  type NoteRecord,
  type ReadApi,
  type SearchNotesInput,
  type UpdateNoteInput,
  type WriteApi,
} from "./api";
import { createFolioServer } from "./server";

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id: "e5555555-5555-4555-8555-555555555501",
    title: "Lisbon Trip",
    body_html: "<h1>Trip</h1><p>Pack <strong>light</strong>.</p>",
    version: 2,
    notebook_id: null,
    notebook_name: null,
    tags: ["travel"],
    pinned: false,
    archived: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    attachments: [],
    ...overrides,
  };
}

function fakeApi(overrides: Partial<ReadApi & WriteApi> = {}): ReadApi & WriteApi {
  return {
    searchNotes: vi.fn(async (_input: SearchNotesInput) => ({
      count: 1,
      notes: [{ id: "note-1", title: "Lisbon Trip" }],
    })),
    getNote: vi.fn(async (_noteId: string) => note()),
    listNotes: vi.fn(async () => ({ count: 0, has_more: false, notes: [] })),
    listNotebooks: vi.fn(async () => ({ notebooks: [] })),
    listTags: vi.fn(async () => ({ tags: [] })),
    getVaultOverview: vi.fn(async () => ({ notes: {} })),
    createNote: vi.fn(async (_input: CreateNoteInput) => ({
      id: "note-new",
      version: 1,
    })),
    updateNote: vi.fn(async (_input: UpdateNoteInput) => ({
      id: "note-1",
      version: 2,
    })),
    moveNotes: vi.fn(async (_ids: string[], _notebookId: string | null) => ({
      moved: 1,
    })),
    addTags: vi.fn(async (_ids: string[], _tags: string[]) => ({
      updated: 1,
    })),
    removeTags: vi.fn(async (_ids: string[], _tags: string[]) => ({
      removed: 1,
    })),
    createNotebook: vi.fn(
      async (_name: string, _parentId: string | null) => ({ id: "nb-new" })
    ),
    renameNotebook: vi.fn(async (_id: string, _name: string) => ({
      id: "nb-1",
      name: "Renamed",
    })),
    ...overrides,
  };
}

async function connect(api: ReadApi & WriteApi) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createFolioServer(api);
  await server.connect(serverTransport);
  const client = new Client({ name: "folio-test", version: "0.0.1" });
  await client.connect(clientTransport);
  return { client, server };
}

function textOf(result: unknown): string {
  const content = (
    result as { content?: Array<{ type?: string; text?: string }> }
  ).content;
  return content?.[0]?.text ?? "";
}

describe("Folio MCP server", () => {
  it("exposes the six read tools and seven write tools", async () => {
    const { client, server } = await connect(fakeApi());
    try {
      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "add_tags",
        "create_note",
        "create_notebook",
        "get_note",
        "get_vault_overview",
        "list_notebooks",
        "list_notes",
        "list_tags",
        "move_notes",
        "remove_tags",
        "rename_notebook",
        "search_notes",
        "update_note",
      ]);
      const readTools = tools
        .filter((tool) => tool.annotations?.readOnlyHint === true)
        .map((tool) => tool.name)
        .sort();
      expect(readTools).toEqual([
        "get_note",
        "get_vault_overview",
        "list_notebooks",
        "list_notes",
        "list_tags",
        "search_notes",
      ]);
      const writeTools = tools
        .filter((tool) => tool.annotations?.readOnlyHint === false)
        .map((tool) => tool.name)
        .sort();
      expect(writeTools).toEqual([
        "add_tags",
        "create_note",
        "create_notebook",
        "move_notes",
        "remove_tags",
        "rename_notebook",
        "update_note",
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("calls search_notes and returns JSON", async () => {
    const api = fakeApi();
    const { client, server } = await connect(api);
    try {
      const result = await client.callTool({
        name: "search_notes",
        arguments: { query: "Lisbon", limit: 5 },
      });

      expect(api.searchNotes).toHaveBeenCalledWith({
        query: "Lisbon",
        limit: 5,
      });
      expect(result.isError).not.toBe(true);
      expect(JSON.parse(textOf(result))).toMatchObject({ count: 1 });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("converts the note body to Markdown", async () => {
    const api = fakeApi();
    const { client, server } = await connect(api);
    try {
      const result = await client.callTool({
        name: "get_note",
        arguments: { note_id: note().id },
      });
      const payload = JSON.parse(textOf(result)) as {
        body_markdown: string;
        truncated: boolean;
      };

      expect(payload.body_markdown).toContain("# Trip");
      expect(payload.body_markdown).toContain("**light**");
      expect(payload.truncated).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("truncates a long note when max_chars is set", async () => {
    const api = fakeApi({
      getNote: vi.fn(async () =>
        note({ body_html: `<p>${"x".repeat(2_000)}</p>` })
      ),
    });
    const { client, server } = await connect(api);
    try {
      const result = await client.callTool({
        name: "get_note",
        arguments: { note_id: note().id, max_chars: 1_000 },
      });
      const payload = JSON.parse(textOf(result)) as {
        body_markdown: string;
        truncated: boolean;
      };

      expect(payload.truncated).toBe(true);
      expect(payload.body_markdown).toContain("[Truncated]");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns a friendly tool error", async () => {
    const api = fakeApi({
      searchNotes: vi.fn(async () => {
        throw new FolioApiError("The Folio token is invalid.");
      }),
    });
    const { client, server } = await connect(api);
    try {
      const result = await client.callTool({
        name: "search_notes",
        arguments: { query: "Lisbon" },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("token is invalid");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("calls the notebook, tag and overview tools", async () => {
    const api = fakeApi();
    const { client, server } = await connect(api);
    try {
      await client.callTool({ name: "list_notes", arguments: { limit: 10 } });
      await client.callTool({ name: "list_notebooks", arguments: {} });
      await client.callTool({ name: "list_tags", arguments: {} });
      await client.callTool({
        name: "get_vault_overview",
        arguments: {},
      });

      expect(api.listNotes).toHaveBeenCalledWith({ limit: 10 });
      expect(api.listNotebooks).toHaveBeenCalled();
      expect(api.listTags).toHaveBeenCalled();
      expect(api.getVaultOverview).toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("creates a note from sanitized Markdown", async () => {
    const api = fakeApi();
    const { client, server } = await connect(api);
    try {
      const result = await client.callTool({
        name: "create_note",
        arguments: {
          title: "Trip",
          body_markdown: "# Pack\n\n**light**",
          tags: ["travel"],
        },
      });

      expect(result.isError).not.toBe(true);
      expect(api.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Trip",
          body_html: expect.stringContaining("<h1>Pack</h1>"),
          tags: ["travel"],
        })
      );
      expect(JSON.parse(textOf(result))).toMatchObject({ version: 1 });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("appends Markdown to the current note", async () => {
    const api = fakeApi();
    const { client, server } = await connect(api);
    try {
      const result = await client.callTool({
        name: "update_note",
        arguments: {
          note_id: note().id,
          expected_version: 2,
          body_markdown: "New section",
          mode: "append",
        },
      });

      expect(result.isError).not.toBe(true);
      expect(api.getNote).toHaveBeenCalledWith(note().id);
      const input = vi.mocked(api.updateNote).mock.calls[0][0];
      expect(input.note_id).toBe(note().id);
      expect(input.expected_version).toBe(2);
      expect(input.body_html).toContain("Pack");
      expect(input.body_html).toContain("New section");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("surfaces a version conflict from update_note", async () => {
    const api = fakeApi({
      updateNote: vi.fn(async () => {
        throw new FolioApiError(
          "The note changed since it was read.",
          "40001"
        );
      }),
    });
    const { client, server } = await connect(api);
    try {
      const result = await client.callTool({
        name: "update_note",
        arguments: {
          note_id: note().id,
          expected_version: 1,
          title: "Stale",
        },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("changed");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects an empty create_note before calling the API", async () => {
    const api = fakeApi();
    const { client, server } = await connect(api);
    try {
      const result = await client.callTool({
        name: "create_note",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("title or body");
      expect(api.createNote).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("calls the move, tag and notebook tools", async () => {
    const api = fakeApi();
    const { client, server } = await connect(api);
    try {
      await client.callTool({
        name: "move_notes",
        arguments: { note_ids: [note().id], notebook_id: null },
      });
      await client.callTool({
        name: "add_tags",
        arguments: { note_ids: [note().id], tags: ["travel"] },
      });
      await client.callTool({
        name: "remove_tags",
        arguments: { note_ids: [note().id], tags: ["travel"] },
      });
      await client.callTool({
        name: "create_notebook",
        arguments: { name: "Trips" },
      });
      await client.callTool({
        name: "rename_notebook",
        arguments: { notebook_id: note().id, name: "Renamed" },
      });

      expect(api.moveNotes).toHaveBeenCalledWith([note().id], null);
      expect(api.addTags).toHaveBeenCalledWith([note().id], ["travel"]);
      expect(api.removeTags).toHaveBeenCalledWith([note().id], ["travel"]);
      expect(api.createNotebook).toHaveBeenCalledWith("Trips", null);
      expect(api.renameNotebook).toHaveBeenCalledWith(
        note().id,
        "Renamed"
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
