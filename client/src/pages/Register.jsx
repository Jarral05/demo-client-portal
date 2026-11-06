import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { AuthLayout } from './Login.jsx';
import {
  errorFor, Field, generalError, PasswordInput, StrengthMeter,
} from '../components/forms.jsx';
import { checkPassword } from '../../../shared/password.js';

const FIELDS = ['name', 'email', 'password'];

export function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', website: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const set = (field) => (value) => {
    setForm((current) => ({ ...current, [field]: value }));
    // An old message disappears as soon as that box is edited, so it never
    // contradicts the strength meter.
    setError((current) => (current?.field === field ? null : current));
  };

  // The same checks the server makes, run first so mistakes show at once.
  // The server checks again, because this page can be bypassed.
  function checkHere() {
    if (!form.name.trim()) return { field: 'name', message: 'Add your name.' };
    if (!/@([a-z\d-]+\.)*[a-z\d-]+\.example$/i.test(form.email.trim())) {
      return { field: 'email', message: 'Use a made-up address ending in .example, like you@company.example. This demo never stores real email addresses.' };
    }
    const strength = checkPassword(form.password, { name: form.name, email: form.email });
    if (!strength.ok) return { field: 'password', message: strength.problem };
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = checkHere();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { message } = await api('/auth/register', { method: 'POST', body: form });
      setDone(message);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const intro = (
    <>
      <h1>Create your account</h1>
      <p>New accounts start as a <strong>Customer</strong>: you can sign in, but you see no client's work until an admin gives you access.</p>
      <h2>How access works</h2>
      <ul className="roles-list">
        <li><strong>Customer</strong>: signed up, waiting for access.</li>
        <li><strong>Client</strong>: one company's projects, files and invoices.</li>
        <li><strong>Staff</strong>: every client, the activity log and branding.</li>
        <li><strong>Admin</strong>: everything, plus giving roles and suspending accounts.</li>
      </ul>
    </>
  );

  if (done) {
    return (
      <AuthLayout intro={intro}>
        <div className="auth-form">
          <h2>Check your inbox</h2>
          <p className="notice" role="status">{done}</p>
          <Link className="button button-wide" to="/inbox">Open the Demo inbox</Link>
          <p className="switch"><Link to="/">Back to sign in</Link></p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout intro={intro}>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h2>Sign up</h2>
        <Field label="Your name" error={errorFor(error, 'name')}>
          {(props) => <input {...props} autoComplete="name" maxLength={80} value={form.name} onChange={(event) => set('name')(event.target.value)} />}
        </Field>
        <Field label="Email address" error={errorFor(error, 'email')} hint="Made up, ending in .example. Your confirmation email arrives in the Demo inbox.">
          {(props) => (
            <input {...props} type="email" autoComplete="email" maxLength={200} value={form.email} onChange={(event) => set('email')(event.target.value)} placeholder="you@company.example" />
          )}
        </Field>
        <Field label="Password" error={errorFor(error, 'password')} hint="At least 10 characters. A few random words work well.">
          {(props) => <PasswordInput {...props} autoComplete="new-password" maxLength={200} value={form.password} onChange={set('password')} />}
        </Field>
        <StrengthMeter password={form.password} person={{ name: form.name, email: form.email }} />

        {/* Hidden from people, and skipped by the keyboard. Only bots fill it in. */}
        <div className="trap" aria-hidden="true">
          <label>Website <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => set('website')(event.target.value)} /></label>
        </div>

        {generalError(error, FIELDS) && <p className="notice notice-error" role="alert">{generalError(error, FIELDS)}</p>}
        <button type="submit" className="button button-wide" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</button>
        <p className="switch">Already have an account? <Link to="/">Sign in</Link></p>
      </form>
    </AuthLayout>
  );
}
