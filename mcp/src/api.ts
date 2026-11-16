import type { McpEnv } from "./env";

export class FolioApiError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "FolioApiError";
    this.code = code;
  }
}

export interface SearchNotesInput {
  query: string;
  notebook_id?: string;
  tag?: string;
  include_archived?: boolean;
  limit?: number;
}

export interface ListNotesInput {
  notebook_id?: string;
  tag?: string;
  include_archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface NoteAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface NoteRecord {
  id: string;
  title: string;
  body_html: string;
  version: number;
  notebook_id: string | null;
  notebook_name: string | null;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
  attachments: NoteAttachment[];
}

export interface ReadApi {
  searchNotes(input: SearchNotesInput): Promise<unknown>;
  getNote(noteId: string): Promise<NoteRecord>;
  listNotes(input: ListNotesInput): Promise<unknown>;
  listNotebooks(): Promise<unknown>;
  listTags(): Promise<unknown>;
  getVaultOverview(): Promise<unknown>;
}

export interface CreateNoteInput {
  title?: string;
  body_html: string;
  notebook_id?: string;
  tags?: string[];
}

export interface UpdateNoteInput {
  note_id: string;
  expected_version: number;
  title?: string;
  body_html?: string;
}

export interface WriteApi {
  createNote(input: CreateNoteInput): Promise<unknown>;
  updateNote(input: UpdateNoteInput): Promise<unknown>;
  moveNotes(noteIds: string[], notebookId: string | null): Promise<unknown>;
  addTags(noteIds: string[], tags: string[]): Promise<unknown>;
  removeTags(noteIds: string[], tags: string[]): Promise<unknown>;
  createNotebook(name: string, parentId: string | null): Promise<unknown>;
  renameNotebook(notebookId: string, name: string): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

function readError(body: unknown): { code: string | null; message: string } {
  if (typeof body !== "object" || body === null) {
    return { code: null, message: "" };
  }

  const record = body as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : null,
    message: typeof record.message === "string" ? record.message : "",
  };
}

function messageFor(code: string | null, fallback: string): string {
  switch (code) {
    case "42501":
      return "The Folio token is invalid, expired, revoked, or lacks the required scope.";
    case "P0002":
      return "The note was not found or is not visible to this account.";
    case "40001":
      return "The note changed since it was read. Re-read it and retry with the current version.";
    case "55000":
      return "The note is in the trash and cannot be changed.";
    case "53400":
      return "This token has reached its daily call limit.";
    case "22023":
      return fallback || "The request was invalid.";
    default:
      return "Folio could not complete the request.";
  }
}

export class FolioApi implements ReadApi, WriteApi {
  constructor(
    private readonly env: McpEnv,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  private async call<T>(
    rpc: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const response = await this.fetchImpl(
      `${this.env.supabaseUrl}/rest/v1/rpc/${rpc}`,
      {
        method: "POST",
        headers: {
          apikey: this.env.anonKey,
          Authorization: `Bearer ${this.env.anonKey}`,
          "x-folio-token": this.env.token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(20_000),
      }
    );

    const text = await response.text();
    let body: unknown = null;
    if (text !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const { code, message } = readError(body);
      throw new FolioApiError(messageFor(code, message), code);
    }

    return body as T;
  }

  searchNotes(input: SearchNotesInput): Promise<unknown> {
    return this.call("api_search_notes", {
      p_query: input.query,
      p_notebook_id: input.notebook_id ?? null,
      p_tag: input.tag ?? null,
      p_include_archived: input.include_archived ?? false,
      p_limit: input.limit ?? 20,
    });
  }

  getNote(noteId: string): Promise<NoteRecord> {
    return this.call<NoteRecord>("api_get_note", { p_note_id: noteId });
  }

  listNotes(input: ListNotesInput): Promise<unknown> {
    return this.call("api_list_notes", {
      p_notebook_id: input.notebook_id ?? null,
      p_tag: input.tag ?? null,
      p_include_archived: input.include_archived ?? false,
      p_limit: input.limit ?? 30,
      p_offset: input.offset ?? 0,
    });
  }

  listNotebooks(): Promise<unknown> {
    return this.call("api_list_notebooks", {});
  }

  listTags(): Promise<unknown> {
    return this.call("api_list_tags", {});
  }

  getVaultOverview(): Promise<unknown> {
    return this.call("api_get_vault_overview", {});
  }

  createNote(input: CreateNoteInput): Promise<unknown> {
    return this.call("api_create_note", {
      p_title: input.title ?? null,
      p_body_html: input.body_html,
      p_notebook_id: input.notebook_id ?? null,
      p_tags: input.tags ?? [],
    });
  }

  updateNote(input: UpdateNoteInput): Promise<unknown> {
    return this.call("api_update_note", {
      p_note_id: input.note_id,
      p_expected_version: input.expected_version,
      p_title: input.title ?? null,
      p_body_html: input.body_html ?? null,
    });
  }

  moveNotes(noteIds: string[], notebookId: string | null): Promise<unknown> {
    return this.call("api_move_notes", {
      p_note_ids: noteIds,
      p_notebook_id: notebookId,
    });
  }

  addTags(noteIds: string[], tags: string[]): Promise<unknown> {
    return this.call("api_add_tags", {
      p_note_ids: noteIds,
      p_tags: tags,
    });
  }

  removeTags(noteIds: string[], tags: string[]): Promise<unknown> {
    return this.call("api_remove_tags", {
      p_note_ids: noteIds,
      p_tags: tags,
    });
  }

  createNotebook(name: string, parentId: string | null): Promise<unknown> {
    return this.call("api_create_notebook", {
      p_name: name,
      p_parent_id: parentId,
    });
  }

  renameNotebook(notebookId: string, name: string): Promise<unknown> {
    return this.call("api_rename_notebook", {
      p_notebook_id: notebookId,
      p_name: name,
    });
  }
}
