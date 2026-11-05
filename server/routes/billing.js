// Invoices and documents, including the PDF downloads.
//
// A download link is checked like any other page: copying the link to someone
// else, or opening it after signing out, gets nothing.
import { Router } from 'express';
import { Client, DocumentFile, Invoice, Project, Workspace } from '../models.js';
import { audit, findOr404, scope } from '../lib/access.js';
import { requireStaff } from '../middleware/auth.js';
import { sendDocumentPdf, sendInvoicePdf } from '../lib/pdf.js';

export const billingRoutes = Router();

// Called only after the record itself passed the access check.
async function pdfContext(record) {
  const [client, project, workspace] = await Promise.all([
    Client.findById(record.clientId),
    Project.findById(record.projectId),
    Workspace.findById(record.workspaceId),
  ]);
  return { clientName: client.name, projectName: project.name, brand: workspace.brand };
}

billingRoutes.get('/invoices', async (req, res) => {
  const invoices = await Invoice.find(scope(req.user)).sort({ issuedAt: -1 });
  const clients = await Client.find({ workspaceId: req.user.workspaceId });
  const names = new Map(clients.map((client) => [String(client._id), client.name]));

  res.json(invoices.map((invoice) => ({
    ...invoice.toJSON(),
    // A client already knows their own name. Others are never included.
    clientName: req.user.role === 'staff' ? names.get(String(invoice.clientId)) : undefined,
  })));
});

billingRoutes.get('/invoices/:id/pdf', async (req, res) => {
  const invoice = await findOr404(Invoice, req, req.params.id, 'an invoice');
  sendInvoicePdf(res, { invoice, ...(await pdfContext(invoice)) });
});

billingRoutes.post('/invoices/:id/mark-paid', requireStaff, async (req, res) => {
  const invoice = await findOr404(Invoice, req, req.params.id, 'an invoice');
  invoice.status = 'paid';
  await invoice.save();
  await audit(req, 'invoice.paid', `Marked ${invoice.number} as paid`, invoice.clientId);
  res.json(invoice);
});

billingRoutes.get('/documents/:id/pdf', async (req, res) => {
  const file = await findOr404(DocumentFile, req, req.params.id, 'a document');
  await audit(req, 'document.downloaded', `Downloaded "${file.title}"`, file.clientId);
  sendDocumentPdf(res, { file, ...(await pdfContext(file)) });
});
