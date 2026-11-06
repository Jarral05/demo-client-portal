import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, useLinkToken } from '../api.js';
import { useSession } from '../session.jsx';
import { PublicPage } from '../components/Layout.jsx';
import { Field, PasswordInput, StrengthMeter } from '../components/forms.jsx';
import { checkPassword } from '../../../shared/password.js';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState({ text: '', error: false });
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const { message } = await api('/auth/forgot', { method: 'POST', body: { email } });
      setResult({ text: message, error: false });
    } catch (err) {
      setResult({ text: err.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicPage>
      <section className="card stack-small">
        <h1>Forgot your password?</h1>
        <p className="muted">
          Enter the account's email address. A reset link goes to its inbox. In this demo, that's the
          {' '}<Link to="/inbox">Demo inbox</Link>, so nothing reaches a real mailbox.
        </p>
        <form className="stack-small" onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="anna@alderfinch.example" />
          </label>
          <div><button type="submit" className="button" disabled={busy}>Send reset link</button></div>
        </form>
        {result.text && (
          <p className={`notice ${result.error ? 'notice-error' : ''}`} role="status">
            {result.text} {!result.error && <Link to="/inbox">Open the Demo inbox</Link>}
          </p>
        )}
        <p className="small"><Link to="/">Back to sign in</Link></p>
      </section>
    </PublicPage>
  );
}

export function ResetPassword() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const token = useLinkToken();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const strength = checkPassword(password);
    if (!strength.ok) {
      setError(strength.problem);
      return;
    }
    setError('');
    try {
      await api('/auth/reset', { method: 'POST', body: { token, password } });
      // A reset signs out every session for this account, possibly including this one.
      await refresh();
      setDone(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <PublicPage>
      <section className="card stack-small">
        <h1>Choose a new password</h1>
        {!token && <p className="notice notice-error" role="alert">This link is incomplete. Open it again from the Demo inbox.</p>}
        {token && !done && (
          <form className="stack-small" onSubmit={handleSubmit} noValidate>
            <Field label="New password" error={error} hint="At least 10 characters. A few random words work well. The link works once.">
              {(props) => <PasswordInput {...props} autoComplete="new-password" maxLength={200} value={password} onChange={(value) => { setPassword(value); setError(''); }} />}
            </Field>
            <StrengthMeter password={password} />
            <div><button type="submit" className="button">Save the new password</button></div>
          </form>
        )}
        {done && (
          <>
            <p className="notice" role="status">
              Password changed. Every session that used the old password is now signed out.
              The sample password won't work for this person in your copy any more: sign in with the new one.
            </p>
            <div><button type="button" className="button" onClick={() => navigate('/')}>Go to sign in</button></div>
          </>
        )}
      </section>
    </PublicPage>
  );
}
