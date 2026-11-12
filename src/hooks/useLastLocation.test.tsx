import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { lastLocationKey } from "../lib/lastLocation";
import { useLastLocation } from "./useLastLocation";

const USER = "user-1";

function Screen() {
  useLastLocation(USER);
  const location = useLocation();

  return (
    <div>
      <span data-testid="at">{location.pathname + location.search}</span>
      <Link to="/">All notes</Link>
      <Link to="/shared">Shared</Link>
      <Link to="/note/abc?notebook=n1">Open note</Link>
      <Link to="/note/new">New note</Link>
      <Link to="/settings">Settings</Link>
    </div>
  );
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="*" element={<Screen />} />
      </Routes>
    </MemoryRouter>
  );
}

function at() {
  return screen.getByTestId("at").textContent;
}

function stored(userId = USER) {
  const raw = localStorage.getItem(lastLocationKey(userId));
  return raw
    ? (JSON.parse(raw) as { pathname: string; search: string })
    : null;
}

function seed(location: { pathname: string; search: string }, userId = USER) {
  localStorage.setItem(lastLocationKey(userId), JSON.stringify(location));
}

beforeEach(() => {
  localStorage.clear();
});

describe("useLastLocation", () => {
  it("reopens the note the account last had open, with its list context", async () => {
    seed({ pathname: "/note/abc", search: "?notebook=n1" });

    renderAt("/");

    await waitFor(() => expect(at()).toBe("/note/abc?notebook=n1"));
  });

  it("does not hijack an explicit link into the app", () => {
    seed({ pathname: "/note/abc", search: "" });

    renderAt("/shared");

    expect(at()).toBe("/shared");
  });

  it("does not override a root URL that carries parameters", () => {
    seed({ pathname: "/note/abc", search: "" });

    renderAt("/?view=pinned");

    expect(at()).toBe("/?view=pinned");
  });

  it("starts at All notes when nothing was stored", async () => {
    renderAt("/");

    expect(at()).toBe("/");
    await waitFor(() =>
      expect(stored()).toEqual({ pathname: "/", search: "" })
    );
  });

  it("never bounces back after the user leaves for All notes", async () => {
    seed({ pathname: "/note/abc", search: "?notebook=n1" });
    renderAt("/");
    await waitFor(() => expect(at()).toBe("/note/abc?notebook=n1"));

    await userEvent.click(screen.getByRole("link", { name: "All notes" }));

    await waitFor(() => {
      expect(at()).toBe("/");
      expect(stored()).toEqual({ pathname: "/", search: "" });
    });
  });

  it("remembers a note opened during the session", async () => {
    renderAt("/");

    await userEvent.click(screen.getByRole("link", { name: "Open note" }));

    await waitFor(() => {
      expect(at()).toBe("/note/abc?notebook=n1");
      expect(stored()).toEqual({
        pathname: "/note/abc",
        search: "?notebook=n1",
      });
    });
  });

  it("keeps the last workspace screen when the session ends on Settings", async () => {
    const first = renderAt("/");
    await userEvent.click(screen.getByRole("link", { name: "Open note" }));
    await waitFor(() =>
      expect(stored()).toEqual({
        pathname: "/note/abc",
        search: "?notebook=n1",
      })
    );

    await userEvent.click(screen.getByRole("link", { name: "Settings" }));
    await waitFor(() => expect(at()).toBe("/settings"));
    expect(stored()).toEqual({
      pathname: "/note/abc",
      search: "?notebook=n1",
    });

    first.unmount();
    renderAt("/");

    await waitFor(() => expect(at()).toBe("/note/abc?notebook=n1"));
  });

  it("never remembers a new-note draft", async () => {
    renderAt("/");

    await userEvent.click(screen.getByRole("link", { name: "New note" }));

    await waitFor(() => expect(at()).toBe("/note/new"));
    expect(stored()).toEqual({ pathname: "/", search: "" });
  });
});
