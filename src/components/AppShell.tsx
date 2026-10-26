import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "../auth/session";
import { useSupabase } from "../db/SupabaseProvider";
import { displayName, initials } from "../lib/user";
import Brand from "./Brand";
import NavIcon, { type NavIconName } from "./NavIcon";

type NavItem = {
  to: string;
  label: string;
  icon: NavIconName;
  end?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Notes", icon: "notes", end: true },
  { to: "/shared", label: "Shared", icon: "shared" },
  { to: "/archived", label: "Archived", icon: "archive" },
  { to: "/trash", label: "Trash", icon: "trash" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export default function AppShell() {
  const session = useSession();
  const client = useSupabase();
  const [signingOut, setSigningOut] = useState(false);
  const name = displayName(session);
  const email = session.user.email ?? "";
  const showEmail = email.length > 0 && email !== name;

  async function signOut() {
    setSigningOut(true);
    try {
      await client.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <Brand />
        </div>

        <nav className="nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <NavIcon name={item.icon} />
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
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
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
