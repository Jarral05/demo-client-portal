// Runs real requests from the visitor's own browser, using their real session.
// Nothing here is simulated: the results are the server's actual answers.
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useApi } from '../api.js';
import { useSession } from '../session.jsx';
import { Loader, PageTitle } from '../components/ui.jsx';
import { CODE_URL } from '../links.js';

function buildChecks(probes, session) {
  const other = probes.otherClientName;
  const checks = [
    {
      title: `Open ${other}'s project by swapping the ID`,
      method: 'GET',
      url: `/api/projects/${probes.otherProject}`,
      expected: 404,
    },
    {
      title: `Download ${other}'s document`,
      method: 'GET',
      url: `/api/documents/${probes.otherDocument}/pdf`,
      expected: 404,
    },
    {
      title: `Download ${other}'s invoice`,
      method: 'GET',
      url: `/api/invoices/${probes.otherInvoice}/pdf`,
      expected: 404,
    },
    {
      title: `Sign off ${other}'s work`,
      method: 'POST',
      url: `/api/deliverables/${probes.otherDeliverable}/decision`,
      body: { decision: 'approved' },
      expected: 404,
    },
    {
      title: 'Open a private document link while signed out',
      method: 'GET',
      url: `/api/documents/${probes.otherDocument}/pdf`,
      signedOut: true,
      expected: 401,
    },
    {
      title: 'Open the staff activity log',
      method: 'GET',
      url: '/api/audit',
      expected: 403,
    },
    {
      title: 'Mark your own invoice as paid',
      method: 'POST',
      url: `/api/invoices/${probes.ownInvoice}/mark-paid`,
      expected: 403,
    },
  ];
  // Only a read-only user can safely try this one: for an approver it would really approve.
  if (!session.user.canApprove && probes.ownDeliverable) {
    checks.push({
      title: "Sign off your own company's work without permission",
      method: 'POST',
      url: `/api/deliverables/${probes.ownDeliverable}/decision`,
      body: { decision: 'approved' },
      expected: 403,
    });
  }
  return checks;
}

async function runCheck(check) {
  const response = await fetch(check.url, {
    method: check.method,
    credentials: check.signedOut ? 'omit' : 'same-origin',
    headers: check.body ? { 'Content-Type': 'application/json' } : undefined,
    body: check.body ? JSON.stringify(check.body) : undefined,
  });
  return response.status;
}

const MEANING = { 401: 'Sign in first', 403: 'Refused', 404: 'Not found' };

export function AccessCheck() {
  const { session } = useSession();
  const state = useApi('/demo/probes');
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  async function runAll(probes) {
    setRunning(true);
    const checks = buildChecks(probes, session);
    const answers = [];
    for (const check of checks) {
      answers.push({ ...check, got: await runCheck(check) });
    }
    setResults(answers);
    setRunning(false);
  }

  const passed = results?.filter((result) => result.got === result.expected).length;

  return (
    <>
      <PageTitle
        title="Access check"
        intro="A hidden button isn't protection. The test is what the server does when someone asks directly."
      />
      <Loader state={state}>
        {(probes) => (probes.applicable ? (
          <>
            <section className="card">
              <p>
                These are real requests from your browser, signed in as <strong>{session.user.name}</strong>.
                Each one tries something this account must not be able to do.
              </p>
              <button type="button" className="button" disabled={running} onClick={() => runAll(probes)}>
                {running ? 'Running…' : results ? 'Run again' : 'Run the checks'}
              </button>
              {results && (
                <p className="check-summary" role="status">
                  {passed} of {results.length} attempts refused.
                </p>
              )}
            </section>

            {results && (
              <section className="card table-wrap">
                <table className="stack-table">
                  <thead>
                    <tr>
                      <th scope="col">Attempt</th>
                      <th scope="col">Request</th>
                      <th scope="col">Server's answer</th>
                      <th scope="col">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => {
                      const ok = result.got === result.expected;
                      return (
                        <tr key={result.title}>
                          <td>{result.title}</td>
                          <td><code className="request">{result.method} {result.url}</code></td>
                          <td className="nowrap">{result.got} {MEANING[result.got] ?? ''}</td>
                          <td className="nowrap">
                            <span className={`result ${ok ? 'result-good' : 'result-bad'}`}>
                              {ok ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
                              {ok ? 'Blocked' : 'Not blocked'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}

            {results && (
              <p className="notice">
                The refused attempts by this account are now in the activity log. Sign out, choose Sam Carter and open <strong>Activity log</strong> to see them.
              </p>
            )}

            <p className="muted small">
              Every one of these checks also runs as an automated test. <a href={CODE_URL}>Read the tests and the code on GitHub</a>.
            </p>
          </>
        ) : (
          <p className="notice">
            Staff can see every client, so there's nothing to refuse here. Sign out and choose Anna, Tom or Priya to run the checks.
          </p>
        ))}
      </Loader>
    </>
  );
}
