export type NavIconName = "notes" | "shared" | "archive" | "trash" | "settings";

export default function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "notes" ? (
        <>
          <path d="M7 4.5h7l4 4V19.5H7z" />
          <path d="M14 4.5v4h4" />
          <path d="M10 12.5h6M10 16h4" />
        </>
      ) : null}
      {name === "shared" ? (
        <>
          <circle cx="9" cy="8.5" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <circle cx="17.5" cy="9.5" r="2.5" />
          <path d="M15 19a4.5 4.5 0 0 1 6 0" />
        </>
      ) : null}
      {name === "archive" ? (
        <>
          <rect x="4" y="5" width="16" height="4" rx="1" />
          <path d="M6 9v9.5h12V9" />
          <path d="M10 13h4" />
        </>
      ) : null}
      {name === "trash" ? (
        <>
          <path d="M5 7h14" />
          <path d="M9 7V5h6v2" />
          <path d="M7 7l1 12h8l1-12" />
          <path d="M10 11v4M14 11v4" />
        </>
      ) : null}
      {name === "settings" ? (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" />
          <circle cx="9" cy="7" r="2" fill="var(--surface)" />
          <circle cx="15" cy="12" r="2" fill="var(--surface)" />
          <circle cx="10" cy="17" r="2" fill="var(--surface)" />
        </>
      ) : null}
    </svg>
  );
}
