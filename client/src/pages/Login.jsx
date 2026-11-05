import { useState } from 'react';
import { useSession } from '../session.jsx';
import { useApi } from '../api.js';
import { DemoBar } from '../components/Layout.jsx';
import { CODE_URL } from '../links.js';

export function Login() {
  const { session, signIn } = useSession();
  const personas = useApi('/auth/personas');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function attempt(address, secret) {
    setBusy(true);
    setError('');
    try {
      await signIn(address, secret);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    attempt(email, password);
  }

  return (
    <>
      <DemoBar />
      <main className="login">
        <section className="login-intro">
          <p className="eyebrow">{session.brand?.name ?? 'Sample Agency'} client portal</p>
          <h1>A client portal that keeps each client's work private</h1>
          <p>
            Clients follow their projects, sign off work, message the team and download their files.
            Staff see every client. No client can see another's.
          </p>
          <h2>Try this</h2>
          <ol>
            <li>Sign in as Anna and approve the homepage design.</li>
            <li>Open <strong>Access check</strong> and watch the server refuse each attempt to reach Priya's data.</li>
            <li>Switch to Sam and open the <strong>Activity log</strong>. Anna's approval and refused attempts are there.</li>
          </ol>
          <p className="login-code">
            <a href={CODE_URL}>Read the code on GitHub</a>
          </p>
        </section>

        <section className="login-panel" aria-labelledby="choose-heading">
          <h2 id="choose-heading">Choose a sample account</h2>
          <div className="persona-list">
            {personas.data?.personas.map((person) => (
              <button
                type="button"
                className="persona"
                key={person.email}
                disabled={busy}
                onClick={() => attempt(person.email, personas.data.password)}
              >
                <span className="persona-name">{person.name}</span>
                <span className="persona-company">{person.company}</span>
                <span className="persona-label">{person.label}</span>
              </button>
            ))}
          </div>

          {error && <p className="notice notice-error" role="alert">{error}</p>}

          <form onSubmit={handleSubmit} className="login-form">
            <h2>Or sign in by hand</h2>
            <label>
              Email
              <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" className="button" disabled={busy}>Sign in</button>
            {personas.data && (
              <p className="hint">Sample password for all accounts: <code>{personas.data.password}</code></p>
            )}
          </form>
        </section>
      </main>
    </>
  );
}
