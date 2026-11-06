import { useState } from 'react';
import { Download } from 'lucide-react';
import { api, useApi } from '../api.js';
import { useSession } from '../session.jsx';
import { isTeam } from "../../../shared/roles.js";
import {
  Empty, formatDate, formatMoney, Loader, PageTitle, StatusTag,
} from '../components/ui.jsx';

export function Invoices() {
  const { session } = useSession();
  const state = useApi('/invoices');
  const [error, setError] = useState('');
  const isStaff = isTeam(session.user.role);

  async function markPaid(invoice) {
    setError('');
    try {
      await api(`/invoices/${invoice._id}/mark-paid`, { method: 'POST' });
      state.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageTitle title="Invoices" intro="Sample figures. This demo doesn't take payments." />
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <Loader state={state}>
        {(invoices) => (
          <div className="card table-wrap">
            {invoices.length === 0 && <Empty>No invoices yet.</Empty>}
            {invoices.length > 0 && (
              <table className="stack-table">
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    {isStaff && <th scope="col">Client</th>}
                    <th scope="col">For</th>
                    <th scope="col">Due</th>
                    <th scope="col" className="right">Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice._id}>
                      <td className="nowrap"><strong>{invoice.number}</strong></td>
                      {isStaff && <td>{invoice.clientName}</td>}
                      <td>{invoice.description}</td>
                      <td className="nowrap" data-label="Due">{formatDate(invoice.dueAt)}</td>
                      <td className="right nowrap" data-label="Amount">{formatMoney(invoice.amountCents)}</td>
                      <td><StatusTag status={invoice.status} /></td>
                      <td className="actions">
                        <a className="icon-link" href={`/api/invoices/${invoice._id}/pdf`}>
                          <Download size={16} aria-hidden="true" /> PDF
                        </a>
                        {isStaff && invoice.status === 'unpaid' && (
                          <button type="button" className="link-button" onClick={() => markPaid(invoice)}>Mark as paid</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Loader>
    </>
  );
}
