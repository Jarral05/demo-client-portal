import { Router } from 'express';
import { AuditEvent, Client, Deliverable, DocumentFile, Invoice, Project, Workspace } from '../models.js';
import { audit } from '../lib/access.js';
import { requireStaff } from '../middleware/auth.js';
import { BRAND_COLORS, brandBody, parse } from '../lib/validate.js';

export const adminRoutes = Router();

// The full activity log, including refused attempts. Staff only.
adminRoutes.get('/audit', requireStaff, async (req, res) => {
  const events = await AuditEvent.find({ workspaceId: req.user.workspaceId })
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(events);
});

adminRoutes.get('/brand', requireStaff, async (req, res) => {
  const workspace = await Workspace.findById(req.user.workspaceId);
  res.json({ brand: workspace.brand, colors: BRAND_COLORS });
});

// White-label: the agency's name and colour replace ours throughout the portal.
adminRoutes.put('/brand', requireStaff, async (req, res) => {
  const brand = parse(brandBody, req.body);
  await Workspace.updateOne({ _id: req.user.workspaceId }, { brand });
  await audit(req, 'brand.updated', `Changed the portal brand to "${brand.name}"`);
  res.json({ brand });
});

// Demo only, for the Access check page: IDs of records this user must not reach.
// A real portal wouldn't have this route. It hands over IDs, never the records.
adminRoutes.get('/demo/probes', async (req, res) => {
  const { user } = req;
  if (user.role !== 'client') return res.json({ applicable: false });

  const foreign = { workspaceId: user.workspaceId, clientId: { $ne: user.clientId } };
  const own = { workspaceId: user.workspaceId, clientId: user.clientId };
  const [otherClient, otherProject, otherDocument, otherInvoice, otherDeliverable, ownInvoice, ownDeliverable] = await Promise.all([
    Client.findOne({ workspaceId: user.workspaceId, _id: { $ne: user.clientId } }),
    Project.findOne(foreign),
    DocumentFile.findOne(foreign),
    Invoice.findOne(foreign),
    Deliverable.findOne(foreign),
    Invoice.findOne(own),
    Deliverable.findOne({ ...own, status: 'pending' }),
  ]);

  res.json({
    applicable: true,
    canApprove: user.canApprove,
    otherClientName: otherClient?.name,
    otherProject: otherProject?._id,
    otherDocument: otherDocument?._id,
    otherInvoice: otherInvoice?._id,
    otherDeliverable: otherDeliverable?._id,
    ownInvoice: ownInvoice?._id,
    ownDeliverable: ownDeliverable?._id,
  });
});
