import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, useLinkToken } from '../api.js';
import { useSession } from '../session.jsx';
import { PublicPage } from '../components/Layout.jsx';

export function VerifyEmail() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const token = useLinkToken();
  const [error, setError] = useState(token ? '' : 'This link is incomplete. Open it again from the Demo inbox.');
  // React may run effects twice while developing. The link works once, so send it once.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api('/auth/verify', { method: 'POST', body: { token } })
      .then(async () => {
        await refresh();
        navigate('/', { replace: true });
      })
      .catch((err) => setError(err.message));
  }, [token, refresh, navigate]);

  return (
    <PublicPage>
      <section className="card stack-small">
        <h1>Confirming your email</h1>
        {!error && <p className="loading" role="status">One moment…</p>}
        {error && (
          <>
            <p className="notice notice-error" role="alert">{error}</p>
            <p className="small"><Link to="/">Go to sign in</Link></p>
          </>
        )}
      </section>
    </PublicPage>
  );
}
