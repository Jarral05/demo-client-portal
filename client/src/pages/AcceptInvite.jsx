import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, useLinkToken } from '../api.js';
import { useSession } from '../session.jsx';
import { PublicPage } from '../components/Layout.jsx';

export function AcceptInvite() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const token = useLinkToken();
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(token ? '' : 'This link is incomplete. Open it again from the Demo inbox.');

  useEffect(() => {
    if (!token) return;
    api('/auth/invite/check', { method: 'POST', body: { token } })
      .then(setInvite)
      .catch((err) => setError(err.message));
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/auth/invite/accept', { method: 'POST', body: { token, password } });
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err.message);
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
            <form className="stack-small" onSubmit={handleSubmit}>
              <label>
                Choose a password
                <input type="password" autoComplete="new-password" minLength={10} maxLength={200} required value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <p className="hint">At least 10 characters. What you can see comes from the invitation, not from this page.</p>
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
