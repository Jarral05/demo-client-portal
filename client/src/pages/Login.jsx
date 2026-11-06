import { useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../session.jsx';
import { useApi } from '../api.js';
import { DemoBar } from '../components/Layout.jsx';
import { CODE_URL } from '../links.js';

// The second step, shown after a correct password when two-step sign-in is on.
function CodeStep({ email, onCancel }) {
  const { confirmCode } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await confirmCode(code);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="stack-small" onSubmit={handleSubmit}>
      <h2>Enter your code</h2>
      <p className="muted">The password for {email} is right. Now enter the 6-digit code from your authenticator app.</p>
      <label>
        Code
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={11} required autoFocus value={code} onChange={(event) => setCode(event.target.value.trim())} />
      </label>
      <p className="hint">Lost your phone? Enter one of your recovery codes instead.</p>
      <div className="button-row">
        <button type="submit" className="button" disabled={busy}>Sign in</button>
        <button type="button" className="button button-quiet" onClick={onCancel}>Start again</button>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </form>
  );
}

export function Login() {
  const { session, signIn } = useSession();
  const personas = useApi('/auth/personas');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsCode, setNeedsCode] = useState('');

  async function attempt(address, secret) {
    setBusy(true);
    setError('');
    try {
      const result = await signIn(address, secret);
      if (result.twoFactor) {
        setNeedsCode(address);
        setBusy(false);
      }
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
            <li>As Sam, invite someone from <strong>People</strong>, then accept from the <strong>Demo inbox</strong>.</li>
          </ol>
          <p className="login-code">
            <a href={CODE_URL}>Read the code on GitHub</a>
          </p>
        </section>

        {needsCode ? (
          <section className="login-panel">
            <CodeStep email={needsCode} onCancel={() => setNeedsCode('')} />
          </section>
        ) : (
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
            <p className="hint">
              <Link to="/forgot-password">Forgot your password?</Link> · <Link to="/inbox">Demo inbox</Link>
            </p>
          </form>
        </section>
        )}
      </main>
    </>
  );
}
