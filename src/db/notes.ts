import type { DbClient } from "./supabase";
import type { Database, NoteRow } from "./database.types";

export type Note = NoteRow;
export type NoteView = "all" | "pinned" | "archived" | "trash" | "shared";
export type NoteSort = "updated" | "created" | "title";

export interface ListNotesOptions {
  view?: NoteView;
  notebookId?: string | null;
  tagId?: string;
  search?: string;
  sort?: NoteSort;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  sharedWithUserId?: string;
}

export interface NotePage {
  notes: Note[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface NewNote {
  title?: string;
  bodyHtml?: string;
  notebookId?: string | null;
}

export interface SaveNoteInput {
  noteId: string;
  expectedVersion: number;
  title: string;
  bodyHtml: string;
}

export type SaveNoteFailure =
  | "conflict"
  | "forbidden"
  | "trashed"
  | "not_found"
  | "unknown";

export class SaveNoteError extends Error {
  readonly kind: SaveNoteFailure;
  readonly code: string | null;

  constructor(kind: SaveNoteFailure, message: string, code: string | null = null) {
    super(message);
    this.name = "SaveNoteError";
    this.kind = kind;
    this.code = code;
  }
}

export function toSaveNoteError(error: {
  code?: string | null;
  message?: string | null;
}): SaveNoteError {
  const code = error.code ?? null;

  switch (code) {
    case "40001":
      return new SaveNoteError(
        "conflict",
        "This note changed on another device.",
        code
      );
    case "42501":
      return new SaveNoteError(
        "forbidden",
        "You do not have permission to edit this note.",
        code
      );
    case "55000":
      return new SaveNoteError(
        "trashed",
        "This note is in the trash and cannot be saved.",
        code
      );
    case "P0002":
      return new SaveNoteError("not_found", "This note no longer exists.", code);
    default:
      return new SaveNoteError(
        "unknown",
        error.message ?? "Could not save the note.",
        code
      );
  }
}

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const SHORT_SEARCH_LENGTH = 3;

function toLikePattern(term: string): string | null {
  const cleaned = term
    .replace(/[%_\\]/g, "")
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `%${cleaned}%` : null;
}

function emptyPage(page: number, pageSize: number): NotePage {
  return { notes: [], page, pageSize, hasMore: false };
}

export async function listNotes(
  client: DbClient,
  options: ListNotesOptions = {}
): Promise<NotePage> {
  const view = options.view ?? "all";
  const page = Math.max(0, Math.trunc(options.page ?? 0));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(options.pageSize ?? DEFAULT_PAGE_SIZE))
  );

  let noteIds: string[] | undefined;

  if (view === "shared") {
    const sharesQuery = client.from("note_shares").select("note_id");
    const { data, error } = options.sharedWithUserId
      ? await sharesQuery.eq("shared_with", options.sharedWithUserId)
      : await sharesQuery;

    if (error) throw error;
    noteIds = (data ?? []).map((row) => row.note_id);
  }

  if (options.tagId) {
    const { data, error } = await client
      .from("note_tags")
      .select("note_id")
      .eq("tag_id", options.tagId);

    if (error) throw error;

    const tagged = (data ?? []).map((row) => row.note_id);
    noteIds = noteIds
      ? noteIds.filter((id) => tagged.includes(id))
      : tagged;
  }

  if (noteIds && noteIds.length === 0) {
    return emptyPage(page, pageSize);
  }

  let query = client.from("notes").select("*");

  switch (view) {
    case "all":
      query = query.is("deleted_at", null).eq("archived", false);
      break;
    case "pinned":
      query = query
        .is("deleted_at", null)
        .eq("archived", false)
        .eq("pinned", true);
      break;
    case "archived":
      query = query.is("deleted_at", null).eq("archived", true);
      break;
    case "trash":
      query = query.not("deleted_at", "is", null);
      break;
    case "shared":
      query = query.is("deleted_at", null).eq("archived", false);
      break;
  }

  if (options.notebookId !== undefined) {
    query =
      options.notebookId === null
        ? query.is("notebook_id", null)
        : query.eq("notebook_id", options.notebookId);
  }

  if (noteIds) {
    query = query.in("id", noteIds);
  }

  const term = options.search?.trim() ?? "";
  if (term.length >= SHORT_SEARCH_LENGTH) {
    query = query.textSearch("search", term, {
      type: "websearch",
      config: "simple",
    });
  } else if (term.length > 0) {
    const pattern = toLikePattern(term);
    if (pattern) {
      query = query.or(
        `title.ilike.${pattern},body_text.ilike.${pattern}`
      );
    }
  }

  const sort = options.sort ?? "updated";
  const ascending = options.direction
    ? options.direction === "asc"
    : sort === "title";
  const sortColumn =
    sort === "created" ? "created_at" : sort === "title" ? "title" : "updated_at";

  const from = page * pageSize;
  const { data, error } = await query
    .order("pinned", { ascending: false })
    .order(sortColumn, { ascending })
    .order("id", { ascending: true })
    .range(from, from + pageSize);

  if (error) throw error;

  const rows = data ?? [];
  return {
    notes: rows.slice(0, pageSize),
    page,
    pageSize,
    hasMore: rows.length > pageSize,
  };
}

export async function getNote(
  client: DbClient,
  noteId: string
): Promise<Note | null> {
  const { data, error } = await client
    .from("notes")
    .select("*")
    .eq("id", noteId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createNote(
  client: DbClient,
  input: NewNote = {}
): Promise<Note> {
  const { data, error } = await client
    .from("notes")
    .insert({
      title: input.title ?? "",
      body_html: input.bodyHtml ?? "",
      notebook_id: input.notebookId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function saveNote(
  client: DbClient,
  input: SaveNoteInput
): Promise<Note> {
  const { data, error } = await client.rpc("save_note", {
    target_note_id: input.noteId,
    expected_version: input.expectedVersion,
    new_title: input.title,
    new_body_html: input.bodyHtml,
  });

  if (error) throw toSaveNoteError(error);
  return data;
}

type NoteUpdate = Database["public"]["Tables"]["notes"]["Update"];

async function updateNote(
  client: DbClient,
  noteId: string,
  patch: NoteUpdate
): Promise<Note> {
  const { data, error } = await client
    .from("notes")
    .update(patch)
    .eq("id", noteId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function setNotePinned(
  client: DbClient,
  noteId: string,
  pinned: boolean
): Promise<Note> {
  return updateNote(client, noteId, { pinned });
}

export async function setNoteArchived(
  client: DbClient,
  noteId: string,
  archived: boolean
): Promise<Note> {
  return updateNote(client, noteId, { archived });
}

export async function moveNoteToNotebook(
  client: DbClient,
  noteId: string,
  notebookId: string | null
): Promise<Note> {
  return updateNote(client, noteId, { notebook_id: notebookId });
}

export async function trashNote(
  client: DbClient,
  noteId: string
): Promise<Note> {
  return updateNote(client, noteId, {
    deleted_at: new Date().toISOString(),
  });
}

export async function restoreNote(
  client: DbClient,
  noteId: string
): Promise<Note> {
  return updateNote(client, noteId, { deleted_at: null });
}

export async function deleteNotePermanently(
  client: DbClient,
  noteId: string
): Promise<void> {
  const { error } = await client.from("notes").delete().eq("id", noteId);
  if (error) throw error;
}
