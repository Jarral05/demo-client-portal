// One small wrapper for talking to the server.
import { useCallback, useEffect, useState } from 'react';

// field: which form box the message belongs to. code: a machine-readable reason.
export class ApiError extends Error {
  constructor(status, message, field, code) {
    super(message);
    this.status = status;
    this.field = field;
    this.code = code;
  }
}

// App.jsx listens for this, and returns to the login page when a session ends.
export const SESSION_ENDED = 'portal:session-ended';

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(SESSION_ENDED));
    throw new ApiError(response.status, data.error || 'Something went wrong. Please try again.', data.field, data.code);
  }
  return data;
}

// Sends a file as raw bytes, with its name in a header. The server decides what
// the file really is from its content, so the type the browser reports doesn't matter.
export async function uploadFile(path, file) {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event(SESSION_ENDED));
    throw new ApiError(response.status, data.error || 'Something went wrong. Please try again.');
  }
  return data;
}

// Reads the token from a link such as /join#token=..., then removes it from the
// address bar, so it isn't left in the browser history. Reading and removing are
// separate steps: React may run the first one twice while developing.
export function useLinkToken() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  return token;
}

// Loads data for a page. Call reload() after changing something.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const reload = useCallback(async () => {
    try {
      const data = await api(path);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
  }, [path]);

  useEffect(() => {
    setState({ data: null, error: null, loading: true });
    reload();
  }, [reload]);

  return { ...state, reload };
}
