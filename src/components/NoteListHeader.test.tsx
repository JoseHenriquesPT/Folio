import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteSort } from "../db/notes";
import type { NoteViewMode } from "../hooks/useViewMode";
import NoteListHeader from "./NoteListHeader";

const SEARCH_DELAY_MS = 200;

function headerProps(overrides: Partial<Parameters<typeof NoteListHeader>[0]> = {}) {
  return {
    title: "All notes",
    subtitle: "Everything you are working on",
    count: "3 notes",
    search: "",
    onSearchChange: vi.fn(),
    sort: "updated" as NoteSort,
    onSortChange: vi.fn(),
    direction: "desc" as const,
    onDirectionChange: vi.fn(),
    mode: "cards" as NoteViewMode,
    onModeChange: vi.fn(),
    onNewNote: vi.fn(),
    allowNew: true,
    ...overrides,
  };
}

/**
 * Mirrors NotesWorkspace: the URL search param is the source of truth and
 * updates a render after the header asks for it.
 */
function Harness({ calls }: { calls: string[] }) {
  const [search, setSearch] = useState("");
  return (
    <NoteListHeader
      {...headerProps({
        search,
        onSearchChange: (value) => {
          calls.push(value);
          setSearch(value);
        },
      })}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NoteListHeader search", () => {
  it("keeps the typed value and pushes it once after the debounce", () => {
    const calls: string[] = [];
    render(<Harness calls={calls} />);
    const input = screen.getByRole<HTMLInputElement>("searchbox");

    fireEvent.change(input, { target: { value: "gar" } });
    expect(input.value).toBe("gar");

    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });

    expect(input.value).toBe("gar");
    expect(calls).toEqual(["gar"]);
  });

  it("does not bounce between the URL and the input once the search is applied", () => {
    const calls: string[] = [];
    render(<Harness calls={calls} />);
    const input = screen.getByRole<HTMLInputElement>("searchbox");

    fireEvent.change(input, { target: { value: "gar" } });
    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });

    for (let index = 0; index < 10; index += 1) {
      act(() => {
        vi.advanceTimersByTime(SEARCH_DELAY_MS);
      });
      expect(input.value).toBe("gar");
    }
    expect(calls).toEqual(["gar"]);
  });

  it("adopts an external search change without pushing it back", () => {
    const props = headerProps();
    const { rerender } = render(<NoteListHeader {...props} />);
    const input = screen.getByRole<HTMLInputElement>("searchbox");

    rerender(<NoteListHeader {...props} search="tomato" />);
    expect(input.value).toBe("tomato");

    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS * 3);
    });
    expect(input.value).toBe("tomato");
    expect(props.onSearchChange).not.toHaveBeenCalled();
  });

  it("clears the input and the search from the keyboard", () => {
    const props = headerProps({ search: "gar" });
    render(<NoteListHeader {...props} />);
    const input = screen.getByRole<HTMLInputElement>("searchbox");

    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("");
    expect(props.onSearchChange).toHaveBeenCalledWith("");
  });
});
