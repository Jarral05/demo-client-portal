import { Link } from 'react-router';
import { useApi } from '../api.js';
import { Empty, formatDateTime, Loader, PageTitle } from '../components/ui.jsx';

export function Inbox({ signedOut = false }) {
  const state = useApi('/auth/inbox');

  return (
    <>
      <PageTitle
        title="Demo inbox"
        intro="A real portal sends these by email. In this demo they land here, so nothing reaches a real mailbox. Mail for every sample person in your copy shows in one place."
      >
        <button type="button" className="button button-quiet" onClick={state.reload}>Refresh</button>
      </PageTitle>
      <Loader state={state}>
        {(messages) => (
          <div className="stack">
            {messages.length === 0 && (
              <div className="card">
                <Empty>
                  No messages yet. Try <strong>Forgot your password?</strong> on the sign-in page,
                  or sign in as Sam and invite someone from <strong>People</strong>.
                </Empty>
              </div>
            )}
            {messages.map((message) => (
              <article key={message._id} className="card mail">
                <div className="mail-head">
                  <span className="small muted">To {message.to}</span>
                  <span className="small muted">{formatDateTime(message.createdAt)}</span>
                </div>
                <h2>{message.subject}</h2>
                <p>{message.body}</p>
                {message.link && <Link className="button" to={message.link}>{message.linkLabel ?? 'Open'}</Link>}
              </article>
            ))}
          </div>
        )}
      </Loader>
      {signedOut && <p className="small"><Link to="/">Back to sign in</Link></p>}
    </>
  );
}
