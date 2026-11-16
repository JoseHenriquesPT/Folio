import { describe, expect, it, vi } from "vitest";
import { FolioApi, type FetchLike } from "./api";

const ENV = {
  supabaseUrl: "https://example.supabase.co",
  anonKey: "anon-key",
  token: "folio_pat_secret",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FolioApi", () => {
  it("posts the RPC with the token header and never in the body", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ count: 1, notes: [] })
    );
    const api = new FolioApi(ENV, fetchImpl);

    await api.searchNotes({ query: "Lisbon" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://example.supabase.co/rest/v1/rpc/api_search_notes"
    );
    expect(init?.headers).toMatchObject({
      apikey: "anon-key",
      Authorization: "Bearer anon-key",
      "x-folio-token": "folio_pat_secret",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      p_query: "Lisbon",
      p_notebook_id: null,
      p_tag: null,
      p_include_archived: false,
      p_limit: 20,
    });
    expect(String(init?.body)).not.toContain("folio_pat_secret");
  });

  it("passes list pagination and filters", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ count: 0, has_more: false, notes: [] })
    );
    const api = new FolioApi(ENV, fetchImpl);

    await api.listNotes({ limit: 10, offset: 20, tag: "travel" });

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      p_notebook_id: null,
      p_tag: "travel",
      p_include_archived: false,
      p_limit: 10,
      p_offset: 20,
    });
  });

  it("returns a note payload", async () => {
    const note = {
      id: "note-1",
      title: "Lisbon",
      body_html: "<p>Pack</p>",
      version: 2,
      notebook_id: null,
      notebook_name: null,
      tags: [],
      pinned: false,
      archived: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      attachments: [],
    };
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(note));
    const api = new FolioApi(ENV, fetchImpl);

    await expect(api.getNote("note-1")).resolves.toEqual(note);
  });

  it("posts create_note and update_note with their arguments", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({}));
    const api = new FolioApi(ENV, fetchImpl);

    await api.createNote({
      title: "Trip",
      body_html: "<p>Pack</p>",
      tags: ["travel"],
    });
    await api.updateNote({
      note_id: "note-1",
      expected_version: 2,
      title: "Trip v2",
    });

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      p_title: "Trip",
      p_body_html: "<p>Pack</p>",
      p_notebook_id: null,
      p_tags: ["travel"],
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({
      p_note_id: "note-1",
      p_expected_version: 2,
      p_title: "Trip v2",
      p_body_html: null,
    });
  });

  it("posts the structural write tools", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({}));
    const api = new FolioApi(ENV, fetchImpl);

    await api.moveNotes(["note-1"], null);
    await api.addTags(["note-1"], ["travel"]);
    await api.removeTags(["note-1"], ["travel"]);
    await api.createNotebook("Trips", null);
    await api.renameNotebook("nb-1", "Renamed");

    expect(
      fetchImpl.mock.calls.map(([url]) => String(url).split("/").pop())
    ).toEqual([
      "api_move_notes",
      "api_add_tags",
      "api_remove_tags",
      "api_create_notebook",
      "api_rename_notebook",
    ]);
  });

  it("maps a version conflict", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ code: "40001", message: "version conflict" }, 409)
    );
    const api = new FolioApi(ENV, fetchImpl);

    await expect(
      api.updateNote({ note_id: "note-1", expected_version: 1, title: "x" })
    ).rejects.toMatchObject({
      code: "40001",
      message: expect.stringContaining("changed"),
    });
  });

  it("maps a trashed note", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ code: "55000", message: "trashed" }, 400)
    );
    const api = new FolioApi(ENV, fetchImpl);

    await expect(
      api.updateNote({ note_id: "note-1", expected_version: 1, title: "x" })
    ).rejects.toMatchObject({
      code: "55000",
      message: expect.stringContaining("trash"),
    });
  });

  it("maps a permission error to the token message", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ code: "42501", message: "permission denied" }, 403)
    );
    const api = new FolioApi(ENV, fetchImpl);

    await expect(api.listTags()).rejects.toMatchObject({
      code: "42501",
      message: expect.stringContaining("token is invalid"),
    });
  });

  it("maps a missing note", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ code: "P0002", message: "note not found" }, 404)
    );
    const api = new FolioApi(ENV, fetchImpl);

    await expect(api.getNote("missing")).rejects.toMatchObject({
      code: "P0002",
      message: expect.stringContaining("not found"),
    });
  });

  it("maps the daily cap", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ code: "53400", message: "daily call limit reached" }, 400)
    );
    const api = new FolioApi(ENV, fetchImpl);

    await expect(api.getVaultOverview()).rejects.toMatchObject({
      code: "53400",
      message: expect.stringContaining("daily call limit"),
    });
  });

  it("keeps a validation message for 22023", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ code: "22023", message: "query is required" }, 400)
    );
    const api = new FolioApi(ENV, fetchImpl);

    await expect(api.searchNotes({ query: "x" })).rejects.toMatchObject({
      message: "query is required",
    });
  });

  it("does not leak an unknown database message", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ code: "XX000", message: "internal SQL detail" }, 500)
    );
    const api = new FolioApi(ENV, fetchImpl);

    await expect(api.listNotebooks()).rejects.toMatchObject({
      message: "Folio could not complete the request.",
    });
  });

  it("handles a non-JSON error body", async () => {
    const fetchImpl = vi.fn<FetchLike>(
      async () => new Response("gateway error", { status: 502 })
    );
    const api = new FolioApi(ENV, fetchImpl);

    await expect(api.listTags()).rejects.toMatchObject({
      message: "Folio could not complete the request.",
    });
  });
});
