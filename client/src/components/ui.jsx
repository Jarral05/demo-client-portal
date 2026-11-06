// Small shared pieces used by the pages.

export function PageTitle({ title, intro, children }) {
  return (
    <header className="page-title">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {children}
    </header>
  );
}

// Shows loading and error states, so each page only deals with its data.
export function Loader({ state, children }) {
  if (state.loading) return <p className="loading" role="status">Loading…</p>;
  if (state.error) {
    const text = state.error.status === 404 ? "This page doesn't exist, or you don't have access to it." : state.error.message;
    return <p className="notice notice-error" role="alert">{text}</p>;
  }
  return children(state.data);
}

const STATUS = {
  todo: ['Not started', 'neutral'],
  in_progress: ['In progress', 'info'],
  done: ['Done', 'good'],
  pending: ['Waiting for sign-off', 'warn'],
  approved: ['Approved', 'good'],
  changes_requested: ['Changes requested', 'warn'],
  unpaid: ['Unpaid', 'warn'],
  paid: ['Paid', 'good'],
};

export function StatusTag({ status }) {
  const [label, tone] = STATUS[status] ?? [status, 'neutral'];
  return <span className={`tag tag-${tone}`}>{label}</span>;
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatMoney(cents) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}
