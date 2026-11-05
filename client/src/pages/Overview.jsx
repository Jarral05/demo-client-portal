import { Link } from 'react-router';
import { useApi } from '../api.js';
import { useSession } from '../session.jsx';
import {
  Empty, formatDate, formatDateTime, formatMoney, Loader, PageTitle, StatusTag,
} from '../components/ui.jsx';

function progress(project) {
  const done = project.milestones.filter((milestone) => milestone.status === 'done').length;
  return { done, total: project.milestones.length, percent: Math.round((done / project.milestones.length) * 100) };
}

export function ProjectCard({ project }) {
  const { done, total, percent } = progress(project);
  return (
    <Link to={`/projects/${project._id}`} className="card card-link">
      {project.clientName && <p className="card-eyebrow">{project.clientName}</p>}
      <h3>{project.name}</h3>
      <p className="muted">{project.summary}</p>
      <div className="progress" role="img" aria-label={`${done} of ${total} milestones done`}>
        <div className="progress-bar" style={{ width: `${percent}%` }} />
      </div>
      <p className="card-meta">{done} of {total} milestones · Due {formatDate(project.dueDate)}</p>
    </Link>
  );
}

export function Overview() {
  const { session } = useSession();
  const state = useApi('/overview');
  const firstName = session.user.name.split(' ')[0];

  return (
    <>
      <PageTitle
        title={`Hello, ${firstName}`}
        intro={session.user.role === 'staff' ? 'Everything across your clients.' : `Your work with ${session.brand.name}.`}
      />
      <Loader state={state}>
        {({ projects, waiting, invoices, recent }) => (
          <>
            <section className="stats" aria-label="Summary">
              <div className="stat"><span className="stat-value">{projects.length}</span><span>Active projects</span></div>
              <div className="stat"><span className="stat-value">{waiting.length}</span><span>Waiting for sign-off</span></div>
              <div className="stat"><span className="stat-value">{invoices.length}</span><span>Unpaid invoices</span></div>
            </section>

            <div className="columns">
              <div>
                <h2>Projects</h2>
                <div className="stack">
                  {projects.map((project) => <ProjectCard key={project._id} project={project} />)}
                </div>
              </div>

              <div>
                <h2>Waiting for sign-off</h2>
                <div className="card list">
                  {waiting.length === 0 && <Empty>Nothing is waiting.</Empty>}
                  {waiting.map((item) => (
                    <Link key={item._id} to={`/projects/${item.projectId}`} className="list-row">
                      <span>
                        {item.title}
                        {item.clientName && <span className="muted small"> · {item.clientName}</span>}
                      </span>
                      <StatusTag status={item.status} />
                    </Link>
                  ))}
                </div>

                <h2>Unpaid invoices</h2>
                <div className="card list">
                  {invoices.length === 0 && <Empty>All paid.</Empty>}
                  {invoices.map((invoice) => (
                    <Link key={invoice._id} to="/invoices" className="list-row">
                      <span>
                        {invoice.number} · Due {formatDate(invoice.dueAt)}
                        {invoice.clientName && <span className="muted small"> · {invoice.clientName}</span>}
                      </span>
                      <strong>{formatMoney(invoice.amountCents)}</strong>
                    </Link>
                  ))}
                </div>

                <h2>Recent activity</h2>
                <div className="card list">
                  {recent.length === 0 && <Empty>Nothing yet. Sign off a design or send a message, and it shows here.</Empty>}
                  {recent.map((event) => (
                    <div key={event._id} className="list-row list-row-plain">
                      <span>{event.actorName}: {event.summary}</span>
                      <span className="muted small nowrap">{formatDateTime(event.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </Loader>
    </>
  );
}
