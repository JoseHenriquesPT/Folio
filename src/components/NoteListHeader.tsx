import { useEffect, useState } from "react";
import type { NoteSort } from "../db/notes";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import type { NoteViewMode } from "../hooks/useViewMode";

interface NoteListHeaderProps {
  title: string;
  subtitle: string;
  count: string;
  search: string;
  onSearchChange: (value: string) => void;
  sort: NoteSort;
  onSortChange: (sort: NoteSort) => void;
  direction?: "asc" | "desc";
  onDirectionChange: () => void;
  mode: NoteViewMode;
  onModeChange: (mode: NoteViewMode) => void;
  onNewNote: () => void;
  allowNew: boolean;
}

const SORT_LABELS: Record<NoteSort, string> = {
  updated: "Updated",
  created: "Created",
  title: "Title",
};

export default function NoteListHeader({
  title,
  subtitle,
  count,
  search,
  onSearchChange,
  sort,
  onSortChange,
  direction,
  onDirectionChange,
  mode,
  onModeChange,
  onNewNote,
  allowNew,
}: NoteListHeaderProps) {
  const [searchValue, setSearchValue] = useState(search);
  const debouncedSearch = useDebouncedValue(searchValue, 200);

  useEffect(() => {
    if (debouncedSearch !== search) onSearchChange(debouncedSearch);
  }, [debouncedSearch, onSearchChange, search]);

  useEffect(() => {
    if (search !== searchValue && search !== debouncedSearch) {
      setSearchValue(search);
    }
  }, [debouncedSearch, search, searchValue]);

  return (
    <header className="list-header">
      <div className="list-title-row">
        <div className="list-heading-block">
          <p className="eyebrow">Notes</p>
          <div className="list-heading">
            <h1>{title}</h1>
            <span className="list-count">{count}</span>
          </div>
          <p className="muted list-subtitle">{subtitle}</p>
        </div>
        {allowNew ? (
          <button type="button" className="button primary" onClick={onNewNote}>
            <span aria-hidden="true">+</span> New note
          </button>
        ) : null}
      </div>

      <div className="list-controls">
        <input
          className="search-input"
          type="search"
          value={searchValue}
          placeholder="Search notes…"
          aria-label="Search notes"
          onChange={(event) => setSearchValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSearchValue("");
              onSearchChange("");
            }
          }}
        />

        <label className="sort-control">
          <span className="sort-label">Sort</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as NoteSort)}
          >
            {(Object.keys(SORT_LABELS) as NoteSort[]).map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="icon-button"
          aria-label={direction === "asc" ? "Ascending" : "Descending"}
          title={direction === "asc" ? "Ascending" : "Descending"}
          onClick={onDirectionChange}
        >
          {direction === "asc" ? "↑" : "↓"}
        </button>

        <div className="view-toggle" role="group" aria-label="Note layout">
          <button
            type="button"
            className={mode === "cards" ? "active" : ""}
            aria-pressed={mode === "cards"}
            onClick={() => onModeChange("cards")}
          >
            Cards
          </button>
          <button
            type="button"
            className={mode === "list" ? "active" : ""}
            aria-pressed={mode === "list"}
            onClick={() => onModeChange("list")}
          >
            List
          </button>
        </div>
      </div>
    </header>
  );
}
