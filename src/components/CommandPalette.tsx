import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../auth/session";
import { useSupabase } from "../db/SupabaseProvider";
import { listNotes, type NoteSummary } from "../db/notes";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatRelativeTime, noteTitle, snippet } from "../lib/format";
import { toMessage } from "../lib/errors";
import { newNoteSearch } from "../lib/notesRoute";
import { useWorkspace } from "./WorkspaceProvider";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface Action {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const session = useSession();
  const client = useSupabase();
  const navigate = useNavigate();
  const location = useLocation();
  const { notebooks } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query, 180);

  const notebookNames = useMemo(
    () => new Map(notebooks.map((notebook) => [notebook.id, notebook.name])),
    [notebooks]
  );

  const actions: Action[] = useMemo(
    () => [
      {
        id: "new-note",
        label: "New note",
        hint: "Ctrl N",
        run: () => navigate(`/note/new${newNoteSearch(location.search)}`),
      },
      {
        id: "archived",
        label: "Go to Archived",
        hint: "",
        run: () => navigate(`/archived${location.search}`),
      },
      {
        id: "trash",
        label: "Go to Trash",
        hint: "",
        run: () => navigate(`/trash${location.search}`),
      },
      {
        id: "settings",
        label: "Open settings",
        hint: "",
        run: () => navigate("/settings"),
      },
    ],
    [location.search, navigate]
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setActiveIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);

    listNotes(client, {
      pageSize: 12,
      search: debouncedQuery || undefined,
    })
      .then((page) => {
        if (active) setResults(page.notes);
      })
      .catch((nextError: unknown) => {
        if (active) setError(nextError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [client, debouncedQuery, open]);

  if (!open) return null;

  const items = [
    ...(query.trim()
      ? []
      : actions.map((action) => ({ kind: "action" as const, action }))),
    ...results.map((note) => ({ kind: "note" as const, note })),
  ];
  const safeIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

  function choose(index: number) {
    const item = items[index];
    if (!item) return;
    if (item.kind === "action") {
      item.action.run();
    } else {
      const next = new URLSearchParams(location.search);
      if (item.note.owner_id !== session.user.id) next.set("view", "shared");
      const search = next.toString();
      navigate(
        `/note/${item.note.id}${search ? `?${search}` : ""}`
      );
    }
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(safeIndex);
    }
  }

  const activeId =
    items.length > 0 ? `palette-item-${safeIndex}` : undefined;

  return (
    <div
      className="palette-backdrop"
      onMouseDown={onClose}
      data-testid="command-palette"
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search notes and actions"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          className="palette-input"
          type="search"
          value={query}
          placeholder="Search notes or run a command…"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={activeId}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
        />

        {error ? (
          <p className="palette-message" role="alert">
            {toMessage(error)}
          </p>
        ) : null}

        <ul className="palette-results" id="palette-results" role="listbox">
          {items.map((item, index) => {
            if (item.kind === "action") {
              return (
                <li
                  key={item.action.id}
                  id={`palette-item-${index}`}
                  role="option"
                  aria-selected={index === safeIndex}
                  className={`palette-item${index === safeIndex ? " active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(index);
                  }}
                >
                  <span className="palette-item-title">{item.action.label}</span>
                  {item.action.hint ? (
                    <kbd className="palette-hint">{item.action.hint}</kbd>
                  ) : null}
                </li>
              );
            }

            const note = item.note;
            const notebook = note.notebook_id
              ? notebookNames.get(note.notebook_id)
              : null;

            return (
              <li
                key={note.id}
                id={`palette-item-${index}`}
                role="option"
                aria-selected={index === safeIndex}
                className={`palette-item${index === safeIndex ? " active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(index);
                }}
              >
                <span className="palette-item-title">{noteTitle(note.title)}</span>
                <span className="palette-item-snippet">
                  {snippet(note.body_text, 80)}
                </span>
                <span className="palette-item-meta">
                  {notebook ? `${notebook} · ` : ""}
                  {formatRelativeTime(note.updated_at)}
                </span>
              </li>
            );
          })}
        </ul>

        {loading ? <p className="palette-message">Searching…</p> : null}
        {!loading && items.length === 0 ? (
          <p className="palette-message">No results.</p>
        ) : null}
      </div>
    </div>
  );
}
