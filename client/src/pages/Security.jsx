import { useState } from 'react';
import { api, useApi } from '../api.js';
import { Loader, PageTitle } from '../components/ui.jsx';

function TurnOn({ onDone }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState('');

  async function start() {
    setError('');
    try {
      setSetup(await api('/account/two-factor/setup', { method: 'POST' }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirm(event) {
    event.preventDefault();
    setError('');
    try {
      const { recoveryCodes } = await api('/account/two-factor/enable', { method: 'POST', body: { code } });
      setCodes(recoveryCodes);
    } catch (err) {
      setError(err.message);
    }
  }

  if (codes) {
    return (
      <div className="stack-small">
        <p className="notice" role="status">Two-step sign-in is on. From now on, signing in needs your password and a code.</p>
        <h3>Your recovery codes</h3>
        <p className="muted">If you lose your phone, each of these works once instead of a code. They're shown only now.</p>
        <ul className="codes">{codes.map((item) => <li key={item}><code>{item}</code></li>)}</ul>
        <div><button type="button" className="button" onClick={onDone}>I've saved them</button></div>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="stack-small">
        <p>Signing in will need your password and a 6-digit code from an app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.</p>
        <div><button type="button" className="button" onClick={start}>Turn on two-step sign-in</button></div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <form className="stack-small" onSubmit={confirm}>
      <p>1. Scan this code with your authenticator app.</p>
      <img className="qr" src={setup.qr} width={220} height={220} alt="QR code for your authenticator app" />
      <p className="small muted">Can't scan it? Type this key into the app instead: <code>{setup.secret}</code></p>
      <label>
        2. Enter the 6-digit code the app shows
        <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.trim())} />
      </label>
      <div><button type="submit" className="button">Turn on</button></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <p className="hint">Your copy of the demo is deleted after 2 hours. Delete the entry from your app afterwards.</p>
    </form>
  );
}

function TurnOff({ codesLeft, onDone }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/account/two-factor/disable', { method: 'POST', body: { code } });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="stack-small" onSubmit={handleSubmit}>
      <p className="notice" role="status">Two-step sign-in is on. Recovery codes left: {codesLeft}.</p>
      <label>
        To turn it off, enter a code from your app, or a recovery code
        <input autoComplete="one-time-code" maxLength={11} required value={code} onChange={(event) => setCode(event.target.value.trim())} />
      </label>
      <div><button type="submit" className="button button-quiet">Turn off</button></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </form>
  );
}

export function Security() {
  const state = useApi('/account/security');
  return (
    <>
      <PageTitle title="Security" intro="Two-step sign-in means a stolen password alone can't open your account." />
      <Loader state={state}>
        {({ twoFactor, recoveryCodesLeft }) => (
          <section className="card narrow">
            <h2>Two-step sign-in</h2>
            {twoFactor
              ? <TurnOff codesLeft={recoveryCodesLeft} onDone={state.reload} />
              : <TurnOn onDone={state.reload} />}
          </section>
        )}
      </Loader>
    </>
  );
}
