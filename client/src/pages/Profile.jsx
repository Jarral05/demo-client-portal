import { useState } from 'react';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { PageTitle } from '../components/ui.jsx';
import {
  errorFor, Field, generalError, PasswordInput, StrengthMeter,
} from '../components/forms.jsx';
import { checkPassword } from '../../../shared/password.js';
import { ROLES } from '../../../shared/roles.js';

function Details() {
  const { session, refresh } = useSession();
  const { user } = session;
  const [name, setName] = useState(user.name);
  const [result, setResult] = useState({ text: '', error: null });

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await api('/account/profile', { method: 'PUT', body: { name } });
      await refresh();
      setResult({ text: 'Saved.', error: null });
    } catch (err) {
      setResult({ text: '', error: err });
    }
  }

  return (
    <form className="card stack-small narrow" onSubmit={handleSubmit} noValidate>
      <h2>Your details</h2>
      <Field label="Name" error={errorFor(result.error, 'name')}>
        {(props) => <input {...props} autoComplete="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />}
      </Field>
      <p className="small muted">Email: {user.email}</p>
      <p className="small muted">
        Role: <strong>{ROLES[user.role].label}</strong>{user.clientName ? ` at ${user.clientName}` : ''}. Only an admin can change it.
      </p>
      <div><button type="submit" className="button">Save</button></div>
      {result.text && <p className="notice" role="status">{result.text}</p>}
      {generalError(result.error, ['name']) && <p className="notice notice-error" role="alert">{result.error.message}</p>}
    </form>
  );
}

function ChangePassword() {
  const { session } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [result, setResult] = useState({ text: '', error: null });
  const person = { name: session.user.name, email: session.user.email };
  // Editing a box clears its old message.
  const edit = (setter, field) => (value) => {
    setter(value);
    setResult((current) => (current.error?.field === field ? { text: '', error: null } : current));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (!current) {
      setResult({ text: '', error: { field: 'currentPassword', message: 'Enter your current password.' } });
      return;
    }
    const strength = checkPassword(next, person);
    if (!strength.ok) {
      setResult({ text: '', error: { field: 'newPassword', message: strength.problem } });
      return;
    }
    try {
      await api('/account/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      setResult({ text: 'Password changed. Any other device signed in to this account is now signed out.', error: null });
    } catch (err) {
      setResult({ text: '', error: err });
    }
  }

  const fields = ['currentPassword', 'newPassword'];
  return (
    <form className="card stack-small narrow" onSubmit={handleSubmit} noValidate>
      <h2>Change password</h2>
      <Field label="Current password" error={errorFor(result.error, 'currentPassword')}>
        {(props) => <PasswordInput {...props} autoComplete="current-password" value={current} onChange={edit(setCurrent, 'currentPassword')} />}
      </Field>
      <Field label="New password" error={errorFor(result.error, 'newPassword')} hint="At least 10 characters. A few random words work well.">
        {(props) => <PasswordInput {...props} autoComplete="new-password" maxLength={200} value={next} onChange={edit(setNext, 'newPassword')} />}
      </Field>
      <StrengthMeter password={next} person={person} />
      <div><button type="submit" className="button">Change password</button></div>
      {result.text && <p className="notice" role="status">{result.text}</p>}
      {generalError(result.error, fields) && <p className="notice notice-error" role="alert">{result.error.message}</p>}
    </form>
  );
}

export function Profile() {
  return (
    <>
      <PageTitle title="Profile" intro="Your name and password. Two-step sign-in is on the Security page." />
      <div className="stack">
        <Details />
        <ChangePassword />
      </div>
    </>
  );
}
