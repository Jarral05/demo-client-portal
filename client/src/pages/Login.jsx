import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../session.jsx';
import { useApi } from '../api.js';
import { DemoBar } from '../components/Layout.jsx';
import { Field, PasswordInput } from '../components/forms.jsx';
import { CODE_URL } from '../links.js';

// The two-column frame shared by the sign-in and sign-up pages.
export function AuthLayout({ intro, children }) {
  const { session } = useSession();
  return (
    <>
      <DemoBar />
      <main className="login">
        <section className="login-intro">
          <p className="eyebrow">{session.brand?.name ?? 'Sample Agency'} client portal</p>
          {intro}
          <p className="login-code"><a href={CODE_URL}>Read the code on GitHub</a></p>
        </section>
        <section className="login-panel">{children}</section>
      </main>
    </>
  );
}

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
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2>Enter your code</h2>
      <p className="muted">The password for {email} is right. Now enter the 6-digit code from your authenticator app.</p>
      <Field label="Code" error={error} hint="Lost your phone? Enter one of your recovery codes instead.">
        {(props) => (
          <input {...props} inputMode="numeric" autoComplete="one-time-code" maxLength={11} required autoFocus value={code} onChange={(event) => setCode(event.target.value.trim())} />
        )}
      </Field>
      <button type="submit" className="button button-wide" disabled={busy || !code}>{busy ? 'Checking…' : 'Sign in'}</button>
      <button type="button" className="link-button" onClick={onCancel}>Start again</button>
    </form>
  );
}

function SampleAccounts({ onPick }) {
  const personas = useApi('/auth/personas');
  if (!personas.data) return null;
  return (
    <details className="samples">
      <summary>Try a sample account</summary>
      <p className="hint">Each button fills in the form. Then press <strong>Sign in</strong>.</p>
      <div className="persona-list">
        {personas.data.personas.map((person) => (
          <button type="button" className="persona" key={person.email} onClick={() => onPick(person.email, personas.data.password)}>
            <span className="persona-name">{person.name}</span>
            <span className="persona-company">{person.company}</span>
            <span className="persona-label">{person.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

export function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [needsCode, setNeedsCode] = useState('');
  const formRef = useRef(null);

  async function handleSubmit(event) {
    event.preventDefault();
    // Friendly checks first, so people don't wait for the server to say "fill this in".
    if (!email.trim() || !password) {
      setError({ message: 'Enter your email address and password.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(email.trim(), password);
      if (result.twoFactor) {
        setNeedsCode(email.trim());
        setBusy(false);
      }
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  function pick(sampleEmail, samplePassword) {
    setEmail(sampleEmail);
    setPassword(samplePassword);
    setError(null);
    formRef.current?.querySelector('button[type=submit]')?.focus();
  }

  const intro = (
    <>
      <h1>A client portal that keeps each client's work private</h1>
      <p>
        Clients follow their projects, sign off work, share files and download invoices.
        Staff see every client. No client can see another's.
      </p>
      <h2>Try this</h2>
      <ol>
        <li>Create an account. You start as a <strong>Customer</strong> and see no client's work yet.</li>
        <li>Sign in as Lena, the admin, open <strong>People</strong>, and give your account access to a client.</li>
        <li>Sign in as Anna and open <strong>Access check</strong>: the server refuses every attempt to reach Priya's data.</li>
        <li>As Sam, open the <strong>Activity log</strong>. Everything above is there, including the refusals.</li>
      </ol>
    </>
  );

  if (needsCode) {
    return <AuthLayout intro={intro}><CodeStep email={needsCode} onCancel={() => setNeedsCode('')} /></AuthLayout>;
  }

  return (
    <AuthLayout intro={intro}>
      <form ref={formRef} className="auth-form" onSubmit={handleSubmit} noValidate>
        <h2>Sign in</h2>
        <Field label="Email address">
          {(props) => (
            <input {...props} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.example" />
          )}
        </Field>
        <Field label="Password">
          {(props) => <PasswordInput {...props} autoComplete="current-password" required value={password} onChange={setPassword} />}
        </Field>
        <p className="forgot"><Link to="/forgot-password">Forgot your password?</Link></p>

        {error && (
          <p className="notice notice-error" role="alert">
            {error.message}
            {error.code === 'unverified' && <> <Link to="/inbox">Open the Demo inbox</Link></>}
          </p>
        )}
        <button type="submit" className="button button-wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="switch">New here? <Link to="/register">Create an account</Link></p>
      </form>

      <SampleAccounts onPick={pick} />
      <p className="hint demo-inbox-link"><Link to="/inbox">Demo inbox</Link>: where this demo's emails arrive.</p>
    </AuthLayout>
  );
}
