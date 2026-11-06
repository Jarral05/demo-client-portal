import { useState } from 'react';
import { Link } from 'react-router';
import { api, useApi } from '../api.js';
import { useSession } from '../session.jsx';
import { Empty, formatDateTime, Loader, PageTitle } from '../components/ui.jsx';
import { ROLE_NAMES, ROLES } from '../../../shared/roles.js';

function accessLabel(user) {
  if (user.role === 'client') return `Client at ${user.clientName}${user.canApprove ? ', signs off work' : ', read and message'}`;
  return `${ROLES[user.role].label}: ${ROLES[user.role].about.toLowerCase()}`;
}

// Admins only. The server checks again: hiding this from staff is only politeness.
function AccessEditor({ user, clients, onDone, onCancel }) {
  const [role, setRole] = useState(user.role);
  const [clientId, setClientId] = useState(user.clientId ?? clients[0]?._id ?? '');
  const [canApprove, setCanApprove] = useState(user.canApprove);
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    setError('');
    try {
      const body = role === 'client' ? { role, clientId, canApprove } : { role };
      await api(`/people/${user._id}/access`, { method: 'PUT', body });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="access-editor" onSubmit={save}>
      <div className="form-grid">
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLE_NAMES.map((name) => <option key={name} value={name}>{ROLES[name].label}</option>)}
          </select>
        </label>
        {role === 'client' && (
          <label>
            Client
            <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              {clients.map((client) => <option key={client._id} value={client._id}>{client.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="hint">{ROLES[role].about}.</p>
      {role === 'client' && (
        <label className="check">
          <input type="checkbox" checked={canApprove} onChange={(event) => setCanApprove(event.target.checked)} />
          Can sign off work
        </label>
      )}
      <div className="button-row">
        <button type="submit" className="button">Save access</button>
        <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </form>
  );
}

function PersonRow({ user, clients, isAdmin, onChange }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  async function toggleSuspend() {
    setError('');
    try {
      await api(`/people/${user._id}/${user.suspended ? 'restore' : 'suspend'}`, { method: 'POST' });
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className={`person${user.suspended ? ' person-suspended' : ''}`}>
      <div className="person-main">
        <div>
          <strong>{user.name}</strong>{user.isYou && <span className="muted small"> (you)</span>}
          <div className="small muted">{user.email}</div>
        </div>
        <div className="person-access">{accessLabel(user)}</div>
        <div className="person-tags">
          {user.suspended && <span className="tag tag-bad">Suspended</span>}
          {!user.emailVerified && <span className="tag tag-warn">Email not confirmed</span>}
          {user.role === 'customer' && !user.suspended && <span className="tag tag-info">Waiting for access</span>}
          {user.twoFactor && <span className="tag tag-good">Two-step on</span>}
        </div>
        {isAdmin && !user.isYou && !editing && (
          <div className="person-actions">
            <button type="button" className="link-button" onClick={() => setEditing(true)}>Change access</button>
            <button type="button" className="link-button" onClick={toggleSuspend}>{user.suspended ? 'Restore' : 'Suspend'}</button>
          </div>
        )}
      </div>
      {editing && (
        <AccessEditor
          user={user}
          clients={clients}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            onChange();
          }}
        />
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </div>
  );
}

function InviteForm({ clients, onChange }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'client', clientId: clients[0]?._id ?? '', canApprove: false });
  const [result, setResult] = useState({ text: '', error: false });
  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const body = form.role === 'client'
      ? form
      : { name: form.name, email: form.email, role: 'staff' };
    try {
      await api('/invites', { method: 'POST', body });
      setResult({ text: `Invitation sent to ${form.email}.`, error: false });
      setForm((current) => ({ ...current, name: '', email: '', canApprove: false }));
      onChange();
    } catch (err) {
      setResult({ text: err.message, error: true });
    }
  }

  return (
    <form className="card stack-small" onSubmit={handleSubmit}>
      <h2>Invite someone</h2>
      <div className="form-grid">
        <label>
          Name
          <input maxLength={80} required value={form.name} onChange={set('name')} />
        </label>
        <label>
          Email
          <input type="email" maxLength={200} required value={form.email} onChange={set('email')} placeholder="jo@alderfinch.example" />
        </label>
        <label>
          Role
          <select value={form.role} onChange={set('role')}>
            <option value="client">Client user</option>
            <option value="staff">Staff</option>
          </select>
        </label>
        {form.role === 'client' && (
          <label>
            Client
            <select value={form.clientId} onChange={set('clientId')}>
              {clients.map((client) => <option key={client._id} value={client._id}>{client.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {form.role === 'client' && (
        <label className="check">
          <input type="checkbox" checked={form.canApprove} onChange={set('canApprove')} />
          Can sign off work
        </label>
      )}
      <p className="hint">Use a made-up address ending in <code>.example</code>. The invitation arrives in the Demo inbox, not a real mailbox.</p>
      <div><button type="submit" className="button">Send invitation</button></div>
      {result.text && (
        <p className={`notice ${result.error ? 'notice-error' : ''}`} role="status">
          {result.text} {!result.error && <Link to="/inbox">Open the Demo inbox</Link>}
        </p>
      )}
    </form>
  );
}

export function People() {
  const { session } = useSession();
  const isAdmin = session.user.role === 'admin';
  const state = useApi('/people');

  async function cancel(id) {
    await api(`/invites/${id}`, { method: 'DELETE' });
    state.reload();
  }

  return (
    <>
      <PageTitle
        title="People"
        intro={isAdmin
          ? 'Everyone who can sign in. As an admin, you can change anyone\'s access or suspend an account, except your own.'
          : 'Everyone who can sign in, and who is invited. Only an admin can change roles or suspend accounts.'}
      />
      <Loader state={state}>
        {({ users, invites, clients }) => (
          <div className="stack">
            <section className="card people">
              {users.map((user) => (
                <PersonRow key={user._id} user={user} clients={clients} isAdmin={isAdmin} onChange={state.reload} />
              ))}
            </section>

            <section className="card">
              <h2>Waiting to join</h2>
              <div className="list">
                {invites.length === 0 && <Empty>No open invitations.</Empty>}
                {invites.map((invite) => (
                  <div key={invite._id} className="list-row">
                    <span>
                      {invite.name} · {invite.email}
                      <span className="muted small"> · {invite.role === 'staff' ? 'Staff' : invite.clientName}
                        {invite.expired ? ' · expired' : ` · link works until ${formatDateTime(invite.validUntil)}`}
                      </span>
                    </span>
                    <button type="button" className="link-button" onClick={() => cancel(invite._id)}>Cancel</button>
                  </div>
                ))}
              </div>
            </section>

            <InviteForm clients={clients} onChange={state.reload} />
          </div>
        )}
      </Loader>
    </>
  );
}
