import { useEffect, useState } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useSession } from "../auth/session";
import { useSupabase } from "../db/SupabaseProvider";
import { buildNotebookTree, flattenNotebookTree } from "../lib/notebooks";
import { newNoteSearch } from "../lib/notesRoute";
import { displayName, initials } from "../lib/user";
import Brand from "./Brand";
import { useCommandPalette } from "./CommandPaletteProvider";
import NavIcon, { type NavIconName } from "./NavIcon";
import NotebookDialog from "./NotebookDialog";
import TagDialog from "./TagDialog";
import { useWorkspace } from "./WorkspaceProvider";

interface NavItem {
  to: string;
  label: string;
  icon: NavIconName;
  active: boolean;
}

export default function AppShell() {
  const session = useSession();
  const client = useSupabase();
  const navigate = useNavigate();
  const location = useLocation();
  const { notebooks, tags, loading } = useWorkspace();
  const { open: openPalette } = useCommandPalette();
  const [signingOut, setSigningOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notebookDialogOpen, setNotebookDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);

  const name = displayName(session);
  const email = session.user.email ?? "";
  const showEmail = email.length > 0 && email !== name;

  const params = new URLSearchParams(location.search);
  const viewParam = params.get("view");
  const notebookParam = params.get("notebook");
  const tagParam = params.get("tag");
  const isNoteRoute = location.pathname.startsWith("/note/");
  const isListRoute =
    location.pathname === "/" || isNoteRoute;

  const navItems: NavItem[] = [
    {
      to: "/",
      label: "All notes",
      icon: "notes",
      active:
        isListRoute && !viewParam && !notebookParam && !tagParam,
    },
    {
      to: "/?view=pinned",
      label: "Pinned",
      icon: "pinned",
      active: viewParam === "pinned" && isListRoute,
    },
    {
      to: "/shared",
      label: "Shared with me",
      icon: "shared",
      active:
        location.pathname === "/shared" ||
        (isListRoute && viewParam === "shared"),
    },
    {
      to: "/archived",
      label: "Archived",
      icon: "archive",
      active:
        location.pathname === "/archived" ||
        (isListRoute && viewParam === "archived"),
    },
    {
      to: "/trash",
      label: "Trash",
      icon: "trash",
      active:
        location.pathname === "/trash" ||
        (isListRoute && viewParam === "trash"),
    },
  ];

  const notebookRows = flattenNotebookTree(buildNotebookTree(notebooks));
  const flushContent = isListRoute ||
    location.pathname === "/shared" ||
    location.pathname === "/archived" ||
    location.pathname === "/trash";

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        navigate({
          pathname: "/note/new",
          search: newNoteSearch(location.search),
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [location.search, navigate]);

  async function signOut() {
    setSigningOut(true);
    try {
      await client.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  function startNewNote() {
    navigate({
      pathname: "/note/new",
      search: newNoteSearch(location.search),
    });
  }

  return (
    <div className="shell">
      <header className="mobile-bar">
        <button
          type="button"
          className="icon-button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="app-sidebar"
          onClick={() => setDrawerOpen(true)}
        >
          <NavIcon name="menu" />
        </button>
        <Brand />
        <button
          type="button"
          className="icon-button"
          aria-label="Search notes"
          onClick={() => {
            setDrawerOpen(false);
            openPalette();
          }}
        >
          <NavIcon name="search" />
        </button>
      </header>

      {drawerOpen ? (
        <div
          className="drawer-backdrop"
          onMouseDown={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={`sidebar${drawerOpen ? " open" : ""}`}
      >
        <div className="sidebar-head">
          <Brand />
          <button
            type="button"
            className="icon-button sidebar-close"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          >
            <NavIcon name="close" />
          </button>
        </div>

        <button
          type="button"
          className="button primary new-note-button"
          onClick={startNewNote}
        >
          <NavIcon name="plus" />
          New note
        </button>

        <button
          type="button"
          className="search-trigger"
          onClick={() => {
            setDrawerOpen(false);
            openPalette();
          }}
        >
          <NavIcon name="search" />
          <span>Search notes</span>
          <kbd>Ctrl K</kbd>
        </button>

        <nav className="nav" aria-label="Views">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-link${item.active ? " active" : ""}`}
              aria-current={item.active ? "page" : undefined}
              aria-label={item.label}
            >
              <NavIcon name={item.icon} />
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span>Notebooks</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Manage notebooks"
              title="Manage notebooks"
              onClick={() => setNotebookDialogOpen(true)}
            >
              <NavIcon name="plus" />
            </button>
          </div>

          <div className="sidebar-links">
            {loading && notebooks.length === 0 ? (
              <p className="sidebar-empty">Loading…</p>
            ) : (
              <>
                <Link
                  to="/?notebook=unfiled"
                  className={`sidebar-link${notebookParam === "unfiled" ? " active" : ""}`}
                  aria-current={notebookParam === "unfiled" ? "page" : undefined}
                >
                  <NavIcon name="notebook" />
                  <span>Unfiled</span>
                </Link>
                {notebookRows.map(({ node, depth }) => (
                  <Link
                    key={node.id}
                    to={`/?notebook=${node.id}`}
                    className={`sidebar-link${notebookParam === node.id ? " active" : ""}`}
                    aria-current={notebookParam === node.id ? "page" : undefined}
                    style={{ paddingLeft: `${12 + depth * 14}px` }}
                  >
                    <NavIcon name="notebook" />
                    <span>{node.name}</span>
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span>Tags</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Manage tags"
              title="Manage tags"
              onClick={() => setTagDialogOpen(true)}
            >
              <NavIcon name="plus" />
            </button>
          </div>

          <div className="sidebar-links">
            {loading && tags.length === 0 ? (
              <p className="sidebar-empty">Loading…</p>
            ) : tags.length === 0 ? (
              <p className="sidebar-empty">No tags yet</p>
            ) : (
              tags.map((tag) => (
                <Link
                  key={tag.id}
                  to={`/?tag=${tag.id}`}
                  className={`sidebar-link${tagParam === tag.id ? " active" : ""}`}
                  aria-current={tagParam === tag.id ? "page" : undefined}
                >
                  <NavIcon name="tag" />
                  <span>{tag.name}</span>
                  <span className="sidebar-count">{tag.note_count}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-foot">
          <Link
            to="/settings"
            className={`nav-link${location.pathname === "/settings" ? " active" : ""}`}
          >
            <NavIcon name="settings" />
            <span className="nav-label">Settings</span>
          </Link>

          <div className="account">
            <span className="avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <span className="account-copy">
              <span className="account-name">{name}</span>
              {showEmail ? <span className="account-email">{email}</span> : null}
            </span>
          </div>
          <button
            type="button"
            className="button ghost small"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <main className={`content${flushContent ? " content--flush" : ""}`}>
        <Outlet />
      </main>

      <NotebookDialog
        open={notebookDialogOpen}
        onClose={() => setNotebookDialogOpen(false)}
      />
      <TagDialog open={tagDialogOpen} onClose={() => setTagDialogOpen(false)} />
    </div>
  );
}
