import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Download } from 'lucide-react';
import { api, uploadFile, useApi } from '../api.js';
import { useSession } from '../session.jsx';
import { isTeam } from "../../../shared/roles.js";
import {
  Empty, formatBytes, formatDate, formatDateTime, formatMoney, Loader, PageTitle, StatusTag,
} from '../components/ui.jsx';

const MAX_UPLOAD = 2 * 1024 * 1024;

function Uploads({ projectId, uploads, user, onChange }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleFile(event) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;
    setError('');
    // Checked here to save a wasted upload. The server checks again, because this can be bypassed.
    if (file.size > MAX_UPLOAD) {
      setError('That file is over 2 MB.');
      input.value = '';
      return;
    }
    setBusy(true);
    try {
      await uploadFile(`/projects/${projectId}/uploads`, file);
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      input.value = '';
    }
  }

  async function remove(id) {
    setError('');
    try {
      await api(`/uploads/${id}`, { method: 'DELETE' });
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <h2>Shared files</h2>
      <div className="list">
        {uploads.length === 0 && <Empty>No files shared yet.</Empty>}
        {uploads.map((file) => (
          <div key={file._id} className="list-row">
            <a href={`/api/uploads/${file._id}`} className="upload-name">
              {file.fileName}
              <span className="muted small"> · {formatBytes(file.size)} · {file.uploadedByName}</span>
            </a>
            {(isTeam(user.role) || String(file.uploadedById) === String(user.id)) && (
              <button type="button" className="link-button small" onClick={() => remove(file._id)}>Delete</button>
            )}
          </div>
        ))}
      </div>
      <label className="upload">
        Share a file
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={busy} onChange={handleFile} />
      </label>
      <p className="hint">PDF, PNG or JPG, up to 2 MB. Only people on this project can download it, and it's deleted with your copy.</p>
      {busy && <p className="small muted" role="status">Uploading…</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </section>
  );
}

function Milestones({ project, canEdit, onChange }) {
  const [error, setError] = useState('');

  async function update(milestone, status) {
    setError('');
    try {
      await api(`/projects/${project._id}/milestones/${milestone._id}`, { method: 'PATCH', body: { status } });
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <h2>Milestones</h2>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <ol className="timeline">
        {project.milestones.map((milestone) => (
          <li key={milestone._id} className={`timeline-item timeline-${milestone.status}`}>
            <div>
              <strong>{milestone.title}</strong>
              <div className="muted small">Due {formatDate(milestone.dueDate)}</div>
            </div>
            {canEdit ? (
              <select
                aria-label={`Status of ${milestone.title}`}
                value={milestone.status}
                onChange={(event) => update(milestone, event.target.value)}
              >
                <option value="todo">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            ) : (
              <StatusTag status={milestone.status} />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Deliverable({ item, canDecide, onChange }) {
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  async function decide(decision) {
    setError('');
    try {
      await api(`/deliverables/${item._id}/decision`, {
        method: 'POST',
        body: decision === 'approved' ? { decision } : { decision, comment },
      });
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="deliverable">
      <div className="deliverable-head">
        <strong>{item.title}</strong>
        <StatusTag status={item.status} />
      </div>
      {item.note && <p className="muted">{item.note}</p>}
      {item.decidedBy && (
        <p className="small muted">{item.decidedBy}, {formatDate(item.decidedAt)}{item.comment ? `: "${item.comment}"` : ''}</p>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {item.status === 'pending' && canDecide && !asking && (
        <div className="button-row">
          <button type="button" className="button" onClick={() => decide('approved')}>Approve</button>
          <button type="button" className="button button-quiet" onClick={() => setAsking(true)}>Request changes</button>
        </div>
      )}
      {item.status === 'pending' && canDecide && asking && (
        <form
          className="stack-small"
          onSubmit={(event) => {
            event.preventDefault();
            decide('changes_requested');
          }}
        >
          <label>
            What needs changing?
            <textarea rows={3} maxLength={1000} required value={comment} onChange={(event) => setComment(event.target.value)} />
          </label>
          <div className="button-row">
            <button type="submit" className="button">Send</button>
            <button type="button" className="button button-quiet" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </form>
      )}
      {item.status === 'pending' && !canDecide && (
        <p className="small muted">Waiting for someone at the client who can sign off.</p>
      )}
    </div>
  );
}

function NewDeliverable({ projectId, onChange }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await api(`/projects/${projectId}/deliverables`, { method: 'POST', body: { title } });
      setTitle('');
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <label className="grow">
        Ask the client to sign off
        <input maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="For example: Contact page design" />
      </label>
      <button type="submit" className="button">Ask</button>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </form>
  );
}

function Messages({ projectId, messages, onChange }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await api(`/projects/${projectId}/messages`, { method: 'POST', body: { body } });
      setBody('');
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <h2>Messages</h2>
      <div className="messages">
        {messages.length === 0 && <Empty>No messages yet.</Empty>}
        {messages.map((message) => (
          <div key={message._id} className={`message message-${message.authorRole}`}>
            <div className="message-head">
              <strong>{message.authorName}</strong>
              <span className="muted small">{formatDateTime(message.createdAt)}</span>
            </div>
            <p>{message.body}</p>
          </div>
        ))}
      </div>
      <form className="stack-small" onSubmit={handleSubmit}>
        <label>
          New message
          <textarea rows={3} maxLength={2000} required value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <div><button type="submit" className="button">Send message</button></div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </form>
    </section>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const { session } = useSession();
  const state = useApi(`/projects/${id}`);
  const isStaff = isTeam(session.user.role);
  const canDecide = session.user.role === 'client' && session.user.canApprove;

  return (
    <Loader state={state}>
      {({ project, deliverables, messages, documents, invoices, uploads }) => (
        <>
          <p className="breadcrumb"><Link to="/projects">Projects</Link></p>
          <PageTitle
            title={project.name}
            intro={[project.clientName, project.summary].filter(Boolean).join(' · ')}
          />
          <div className="columns">
            <div className="stack">
              <section className="card">
                <h2>Sign-offs</h2>
                {deliverables.length === 0 && <Empty>Nothing to sign off on this project yet.</Empty>}
                {deliverables.map((item) => (
                  <Deliverable key={item._id} item={item} canDecide={canDecide} onChange={state.reload} />
                ))}
                {isStaff && <NewDeliverable projectId={project._id} onChange={state.reload} />}
              </section>
              <Messages projectId={project._id} messages={messages} onChange={state.reload} />
            </div>

            <div className="stack">
              <Milestones project={project} canEdit={isStaff} onChange={state.reload} />
              <section className="card">
                <h2>Documents</h2>
                <div className="list">
                  {documents.length === 0 && <Empty>No documents yet.</Empty>}
                  {documents.map((file) => (
                    <a key={file._id} className="list-row" href={`/api/documents/${file._id}/pdf`}>
                      <span>{file.title}<span className="muted small"> · {file.kind}</span></span>
                      <Download size={16} aria-label="Download PDF" />
                    </a>
                  ))}
                </div>
              </section>
              <Uploads projectId={project._id} uploads={uploads} user={session.user} onChange={state.reload} />
              <section className="card">
                <h2>Invoices</h2>
                <div className="list">
                  {invoices.length === 0 && <Empty>No invoices on this project.</Empty>}
                  {invoices.map((invoice) => (
                    <a key={invoice._id} className="list-row" href={`/api/invoices/${invoice._id}/pdf`}>
                      <span>{invoice.number} · {formatMoney(invoice.amountCents)}</span>
                      <StatusTag status={invoice.status} />
                    </a>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </Loader>
  );
}
