export default function PlaceholderPage({
  eyebrow,
  title,
  heading,
  description,
}: {
  eyebrow: string;
  title: string;
  heading: string;
  description: string;
}) {
  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </header>

      <div className="empty-state">
        <div className="paper-stack" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h2>{heading}</h2>
        <p className="muted">{description}</p>
      </div>
    </section>
  );
}
