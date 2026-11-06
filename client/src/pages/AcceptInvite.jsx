import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, useLinkToken } from '../api.js';
import { useSession } from '../session.jsx';
import { PublicPage } from '../components/Layout.jsx';
import { Field, PasswordInput, StrengthMeter } from '../components/forms.jsx';
import { checkPassword } from '../../../shared/password.js';

export function AcceptInvite() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const token = useLinkToken();
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [error, setError] = useState(token ? '' : 'This link is incomplete. Open it again from the Demo inbox.');

  useEffect(() => {
    if (!token) return;
    api('/auth/invite/check', { method: 'POST', body: { token } })
      .then(setInvite)
      .catch((err) => setError(err.message));
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    const strength = checkPassword(password, invite);
    if (!strength.ok) {
      setPasswordError(strength.problem);
      return;
    }
    setPasswordError('');
    try {
      await api('/auth/invite/accept', { method: 'POST', body: { token, password } });
      await refresh();
      navigate('/');
    } catch (err) {
      if (err.field === 'password') setPasswordError(err.message);
      else setError(err.message);
    }
  }

  const joining = invite?.role === 'staff'
    ? 'as staff, with access to every client'
    : `for ${invite?.clientName}${invite?.canApprove ? ', able to sign off work' : ', able to read and send messages'}`;

  return (
    <PublicPage>
      <section className="card stack-small">
        <h1>Join the client portal</h1>
        {invite && (
          <>
            <p>
              <strong>{invite.invitedByName}</strong> invited <strong>{invite.name}</strong> ({invite.email})
              {' '}to the {invite.brandName} client portal, {joining}.
            </p>
            <form className="stack-small" onSubmit={handleSubmit} noValidate>
              <Field label="Choose a password" error={passwordError} hint="At least 10 characters. What you can see comes from the invitation, not from this page.">
                {(props) => <PasswordInput {...props} autoComplete="new-password" maxLength={200} value={password} onChange={(value) => { setPassword(value); setPasswordError(''); }} />}
              </Field>
              <StrengthMeter password={password} person={invite} />
              <div><button type="submit" className="button">Join and sign in</button></div>
            </form>
          </>
        )}
        {!invite && !error && <p className="loading" role="status">Checking the invitation…</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </section>
    </PublicPage>
  );
}
