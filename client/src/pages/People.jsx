import { useState } from 'react';
import { Link } from 'react-router';
import { api, useApi } from '../api.js';
import { Empty, formatDateTime, Loader, PageTitle } from '../components/ui.jsx';

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
  const state = useApi('/people');

  async function cancel(id) {
    await api(`/invites/${id}`, { method: 'DELETE' });
    state.reload();
  }

  return (
    <>
      <PageTitle title="People" intro="Everyone who can sign in, and who is invited. Each person sees only what their role allows." />
      <Loader state={state}>
        {({ users, invites, clients }) => (
          <div className="stack">
            <div className="card table-wrap">
              <table className="stack-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Access</th>
                    <th scope="col">Two-step</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td>{user.name}</td>
                      <td data-label="Email">{user.email}</td>
                      <td data-label="Access">
                        {user.role === 'staff' ? 'Staff, every client' : `${user.clientName}${user.canApprove ? ', signs off work' : ', read and message'}`}
                      </td>
                      <td data-label="Two-step">{user.twoFactor ? <span className="tag tag-good">On</span> : <span className="tag tag-neutral">Off</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
