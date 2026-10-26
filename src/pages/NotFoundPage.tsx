import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Not found</p>
        <h1>This page is not in the folio</h1>
        <p className="muted">The link may be old, or the note may have moved.</p>
      </header>
      <Link className="button primary" to="/">
        Back to notes
      </Link>
    </section>
  );
}
