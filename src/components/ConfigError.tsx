import Brand from "./Brand";

export default function ConfigError({ problems }: { problems: string[] }) {
  return (
    <main className="auth">
      <section className="auth-card config-error">
        <Brand />
        <div className="auth-copy">
          <p className="eyebrow">Configuration</p>
          <h1>Folio needs Supabase</h1>
          <p className="muted">
            The app could not start because the Supabase environment is incomplete.
          </p>
        </div>
        <ul className="problem-list">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
        <p className="muted">
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in the local
          Supabase URL and publishable key, then restart the dev server.
        </p>
      </section>
    </main>
  );
}
