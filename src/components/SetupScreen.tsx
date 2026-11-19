import { Logo } from './Layout'

export default function SetupScreen() {
  return (
    <div className="setup">
      <div className="card card-glow setup-card">
        <Logo />
        <h1>Connect your Supabase project</h1>
        <p className="muted">
          GGLeague needs a Supabase backend for accounts, tournaments, duels and rankings. It takes about two minutes:
        </p>
        <ol className="setup-steps">
          <li>
            Create a project at <strong>supabase.com</strong>.
          </li>
          <li>
            Open the SQL editor and run <code>supabase/migrations/20261117000000_ggleague_schema.sql</code>.
          </li>
          <li>
            Optional: run <code>supabase/seed.sql</code> to add clearly-labelled <em>demo</em> players and tournaments.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code> and paste your project URL and publishable (anon) key.
          </li>
          <li>
            Restart <code>npm run dev</code>.
          </li>
        </ol>
        <p className="muted small">Only the public key is used in the browser. All permissions are enforced by row-level security in the database.</p>
      </div>
    </div>
  )
}
