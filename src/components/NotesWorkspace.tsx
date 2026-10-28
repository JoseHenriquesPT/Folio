import { lazy, Suspense, useMemo } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useSession } from "../auth/session";
import type { NoteSort, NoteView } from "../db/notes";
import { useNoteList } from "../hooks/useNoteList";
import { useViewMode } from "../hooks/useViewMode";
import { useWorkspaceRealtime } from "../hooks/useWorkspaceRealtime";
import { formatNoteCount } from "../lib/format";
import { notebookBreadcrumb } from "../lib/notebooks";
import { newNoteSearch } from "../lib/notesRoute";
import NoteList from "./NoteList";
import NoteListHeader from "./NoteListHeader";
import { useWorkspace } from "./WorkspaceProvider";

const NoteEditor = lazy(() => import("./NoteEditor"));

const VIEWS: NoteView[] = ["all", "pinned", "archived", "trash", "shared"];

function isNoteView(value: string | null): value is NoteView {
  return value !== null && VIEWS.includes(value as NoteView);
}

function parseSort(value: string | null): NoteSort {
  return value === "created" || value === "title" ? value : "updated";
}

export default function NotesWorkspace({
  defaultView = "all",
}: {
  defaultView?: NoteView;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { notebooks, tags, version: workspaceVersion } = useWorkspace();
  const { mode, setMode } = useViewMode();

  const routeNoteId = params.id;
  const noteId = routeNoteId && routeNoteId !== "new" ? routeNoteId : null;
  const isNewNote = routeNoteId === "new";

  const viewParam = searchParams.get("view");
  const view: NoteView = isNoteView(viewParam) ? viewParam : defaultView;
  const notebookParam = searchParams.get("notebook");
  const unfiled = notebookParam === "unfiled";
  const notebookId = unfiled ? null : notebookParam;
  const tagId = searchParams.get("tag");
  const query = searchParams.get("q") ?? "";
  const sort = parseSort(searchParams.get("sort"));
  const direction =
    searchParams.get("dir") === "asc"
      ? "asc"
      : searchParams.get("dir") === "desc"
        ? "desc"
        : sort === "title"
          ? "asc"
          : "desc";

  const notebook = notebookId
    ? notebooks.find((item) => item.id === notebookId)
    : null;
  const tag = tagId ? tags.find((item) => item.id === tagId) : null;
  const breadcrumb = notebookId
    ? notebookBreadcrumb(notebooks, notebookId)
    : [];

  const list = useNoteList({
    view,
    notebookId: unfiled ? null : (notebookId ?? undefined),
    tagId: tagId ?? undefined,
    search: query,
    sort,
    direction,
    sharedWithUserId: view === "shared" ? session.user.id : undefined,
    refreshKey: workspaceVersion,
  });

  useWorkspaceRealtime(session.user.id, list.refresh, view !== "trash");

  function updateParam(key: string, value: string | null) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key === "view" && value === "all") next.delete("view");
        return next;
      },
      { replace: true }
    );
  }

  const title = tag
    ? `#${tag.name}`
    : unfiled
      ? "Unfiled"
      : notebook
        ? notebook.name
        : view === "pinned"
          ? "Pinned"
          : view === "shared"
            ? "Shared with me"
            : view === "archived"
              ? "Archived"
              : view === "trash"
                ? "Trash"
                : "All notes";

  const subtitle = query
    ? `Results for “${query}”`
    : tag
      ? "Tagged notes"
      : unfiled
        ? "Notes without a notebook"
        : notebook
          ? breadcrumb.map((item) => item.name).join(" / ")
          : view === "pinned"
          ? "Pinned notes, always first"
          : view === "shared"
            ? "Notes shared with you by the owner"
            : view === "archived"
              ? "Notes kept out of the main list"
              : view === "trash"
                ? "Notes you delete wait here"
                : "Everything you are working on";

  const countLabel =
    list.loading && list.notes.length === 0
      ? "Loading…"
      : list.hasMore
        ? `${list.notes.length}+ notes`
        : formatNoteCount(list.notes.length);

  const allowNew = view === "all" && !tagId;

  const empty = useMemo(() => {
    if (query) {
      return { title: "No matches", body: "Try another word or clear the search." };
    }
    if (tag) {
      return {
        title: "No notes with this tag",
        body: "Attach this tag to a note and it will appear here.",
      };
    }
    if (unfiled) {
      return {
        title: "Unfiled is empty",
        body: "New notes created without a notebook will appear here.",
      };
    }
    if (notebook) {
      return {
        title: "No notes in this notebook",
        body: "New notes created here will land in this view.",
      };
    }
    switch (view) {
      case "trash":
        return {
          title: "Trash is empty",
          body: "Notes you delete will wait here until you restore them.",
        };
      case "archived":
        return {
          title: "No archived notes",
          body: "Archived notes stay out of the main list but are never deleted.",
        };
      case "pinned":
        return {
          title: "Nothing pinned",
          body: "Pin the notes you reach for most and they will stay at the top.",
        };
      case "shared":
        return {
          title: "Nothing shared with you",
          body: "Notes the owner shares with you will appear here.",
        };
      default:
        return {
          title: "No notes yet",
          body: "Capture the first thought and build from there.",
        };
    }
  }, [notebook, query, tag, unfiled, view]);

  function listHref(): string {
    const next = new URLSearchParams(searchParams);
    const path =
      view === "shared"
        ? "/shared"
        : view === "archived"
          ? "/archived"
          : view === "trash"
            ? "/trash"
            : "/";
    if (view === "shared" || view === "archived" || view === "trash") {
      next.delete("view");
    }
    const search = next.toString();
    return `${path}${search ? `?${search}` : ""}`;
  }

  const noteSearch = useMemo(() => {
    const next = new URLSearchParams(location.search);
    if (view === "all") next.delete("view");
    else next.set("view", view);
    return next.toString();
  }, [location.search, view]);

  function startNewNote() {
    navigate({
      pathname: "/note/new",
      search: newNoteSearch(location.search),
    });
  }

  function handleCreated(id: string) {
    navigate(
      { pathname: `/note/${id}`, search: location.search },
      { replace: true }
    );
  }

  const noteOpen = noteId !== null || isNewNote;

  return (
    <div className={`workspace${noteOpen ? " has-note" : ""}`}>
      <section className="list-pane" aria-label="Notes list">
        <NoteListHeader
          title={title}
          subtitle={subtitle}
          count={countLabel}
          search={query}
          onSearchChange={(value) => updateParam("q", value || null)}
          sort={sort}
          onSortChange={(value) => updateParam("sort", value === "updated" ? null : value)}
          direction={direction}
          onDirectionChange={() =>
            updateParam("dir", direction === "asc" ? "desc" : "asc")
          }
          mode={mode}
          onModeChange={setMode}
          onNewNote={startNewNote}
          allowNew={allowNew}
        />

        <NoteList
          hrefSearch={noteSearch}
          notes={list.notes}
          loading={list.loading}
          loadingMore={list.loadingMore}
          hasMore={list.hasMore}
          error={list.error}
          mode={mode}
          searchActive={query.length > 0}
          onLoadMore={list.loadMore}
          onRetry={list.refresh}
          emptyTitle={empty.title}
          emptyBody={empty.body}
          onNewNote={startNewNote}
          allowNew={allowNew}
        />
      </section>

      {noteOpen ? (
        <Suspense
          fallback={
            <section className="editor-pane editor-loading" aria-label="Loading editor">
              <span className="skeleton-line wide" />
              <span className="skeleton-line" />
              <span className="skeleton-line short" />
            </section>
          }
        >
          <NoteEditor
            noteId={isNewNote ? null : noteId}
            initialNotebookId={notebookId}
            onCreated={handleCreated}
            onChanged={list.refresh}
            onBack={() => navigate(listHref())}
          />
        </Suspense>
      ) : (
        <section className="editor-pane editor-empty" aria-label="No note open">
          <div className="editor-empty-card">
            <p className="eyebrow">Folio</p>
            <h2>Choose a note or start a new one</h2>
            <p className="muted">
              Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to search, or{" "}
              <kbd>Ctrl</kbd> + <kbd>N</kbd> for a fresh page.
            </p>
            {allowNew ? (
              <button type="button" className="button primary" onClick={startNewNote}>
                New note
              </button>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
