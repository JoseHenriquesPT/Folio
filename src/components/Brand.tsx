export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="Folio">
      <span className="brand-mark" aria-hidden="true">
        f
      </span>
      {compact ? null : <span className="brand-word">folio</span>}
    </span>
  );
}
