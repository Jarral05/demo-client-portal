import { useApi } from '../api.js';
import { Empty, formatDateTime, Loader, PageTitle } from '../components/ui.jsx';

export function ActivityLog() {
  const state = useApi('/audit');
  return (
    <>
      <PageTitle title="Activity log" intro="Who did what, including attempts the server refused." />
      <Loader state={state}>
        {(events) => (
          <div className="card table-wrap">
            {events.length === 0 && <Empty>Nothing yet.</Empty>}
            <table className="stack-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const denied = event.action === 'access.denied';
                  return (
                    <tr key={event._id} className={denied ? 'row-denied' : undefined}>
                      <td className="nowrap">{formatDateTime(event.createdAt)}</td>
                      <td className="nowrap">{event.actorName}</td>
                      <td>
                        {denied && <span className="tag tag-bad">Refused</span>} {event.summary}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Loader>
    </>
  );
}
