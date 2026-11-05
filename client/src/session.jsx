// Who is signed in, and which brand to show. Any page can read this.
//
// This only decides what to display. The server checks every request again,
// because anything in the browser can be changed by the person using it.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, SESSION_ENDED } from './api.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);

  const refresh = useCallback(async () => {
    setSession(await api('/auth/session'));
  }, []);

  useEffect(() => {
    refresh().catch(() => setSession({ user: null, brand: null }));
    window.addEventListener(SESSION_ENDED, refresh);
    return () => window.removeEventListener(SESSION_ENDED, refresh);
  }, [refresh]);

  // The brand colour is one CSS variable, so a rebrand changes the whole portal.
  useEffect(() => {
    if (session?.brand?.color) document.documentElement.style.setProperty('--brand', session.brand.color);
  }, [session?.brand?.color]);

  const signIn = useCallback(async (email, password) => {
    await api('/auth/login', { method: 'POST', body: { email, password } });
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    await refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ session, refresh, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
