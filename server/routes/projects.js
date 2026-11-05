import { Router } from 'express';
import {
  AuditEvent, Client, Deliverable, DocumentFile, Invoice, Message, Project,
} from '../models.js';
import { audit, findOr404, HttpError, scope } from '../lib/access.js';
import { requireStaff } from '../middleware/auth.js';
import { decisionBody, deliverableBody, messageBody, milestoneBody, parse } from '../lib/validate.js';

export const projectRoutes = Router();

// Only staff ever see more than one client, so only they need the names attached.
async function withClientNames(user, records) {
  if (user.role !== 'staff') return records.map((record) => record.toJSON());
  const clients = await Client.find({ workspaceId: user.workspaceId });
  const names = new Map(clients.map((client) => [String(client._id), client.name]));
  return records.map((record) => ({ ...record.toJSON(), clientName: names.get(String(record.clientId)) }));
}

// The dashboard. Everything here goes through scope().
projectRoutes.get('/overview', async (req, res) => {
  const { user } = req;
  const [projects, waiting, invoices, recent] = await Promise.all([
    Project.find(scope(user)).sort({ dueDate: 1 }),
    Deliverable.find(scope(user, { status: 'pending' })).sort({ createdAt: 1 }),
    Invoice.find(scope(user, { status: 'unpaid' })).sort({ dueAt: 1 }),
    AuditEvent.find(scope(user, { action: { $nin: ['access.denied', 'auth.login'] }, clientId: { $exists: true } }))
      .sort({ createdAt: -1 })
      .limit(8),
  ]);
  // scope() overwrites clientId for client users, which also limits this feed to their company.
  res.json({
    projects: await withClientNames(user, projects),
    waiting: await withClientNames(user, waiting),
    invoices: await withClientNames(user, invoices),
    recent,
  });
});

projectRoutes.get('/projects', async (req, res) => {
  const projects = await Project.find(scope(req.user)).sort({ dueDate: 1 });
  res.json(await withClientNames(req.user, projects));
});

projectRoutes.get('/projects/:id', async (req, res) => {
  const project = await findOr404(Project, req, req.params.id, 'a project');
  const inProject = scope(req.user, { projectId: project._id });

  const [deliverables, messages, documents, invoices] = await Promise.all([
    Deliverable.find(inProject).sort({ createdAt: -1 }),
    Message.find(inProject).sort({ createdAt: 1 }),
    DocumentFile.find(inProject).sort({ title: 1 }),
    Invoice.find(inProject).sort({ issuedAt: -1 }),
  ]);
  const [withName] = await withClientNames(req.user, [project]);
  res.json({ project: withName, deliverables, messages, documents, invoices });
});

projectRoutes.post('/projects/:id/messages', async (req, res) => {
  const project = await findOr404(Project, req, req.params.id, 'a project');
  const { body } = parse(messageBody, req.body);

  // clientId comes from the project in the database, never from the request.
  const message = await Message.create({
    workspaceId: req.user.workspaceId,
    expiresAt: req.user.expiresAt,
    clientId: project.clientId,
    projectId: project._id,
    authorName: req.user.name,
    authorRole: req.user.role,
    body,
  });
  await audit(req, 'message.sent', `Sent a message on ${project.name}`, project.clientId);
  res.status(201).json(message);
});

projectRoutes.patch('/projects/:id/milestones/:milestoneId', requireStaff, async (req, res) => {
  const project = await findOr404(Project, req, req.params.id, 'a project');
  const { status } = parse(milestoneBody, req.body);

  const milestone = project.milestones.id(req.params.milestoneId);
  if (!milestone) throw new HttpError(404, 'Not found');

  milestone.status = status;
  await project.save();
  await audit(req, 'milestone.updated', `Set "${milestone.title}" to ${status.replace('_', ' ')}`, project.clientId);
  res.json(project);
});

projectRoutes.post('/projects/:id/deliverables', requireStaff, async (req, res) => {
  const project = await findOr404(Project, req, req.params.id, 'a project');
  const { title, note } = parse(deliverableBody, req.body);

  const deliverable = await Deliverable.create({
    workspaceId: req.user.workspaceId,
    expiresAt: req.user.expiresAt,
    clientId: project.clientId,
    projectId: project._id,
    title,
    note,
  });
  await audit(req, 'deliverable.created', `Asked for approval of "${title}"`, project.clientId);
  res.status(201).json(deliverable);
});

projectRoutes.post('/deliverables/:id/decision', async (req, res) => {
  const deliverable = await findOr404(Deliverable, req, req.params.id, 'a deliverable');

  // Only an approver at the client can sign off. Staff can't approve their own work.
  if (req.user.role !== 'client' || !req.user.canApprove) {
    await audit(req, 'access.denied', `Tried to sign off "${deliverable.title}" without permission`, deliverable.clientId);
    throw new HttpError(403, 'This account cannot sign off work');
  }
  if (deliverable.status !== 'pending') throw new HttpError(409, 'This has already been decided');

  const { decision, comment } = parse(decisionBody, req.body);
  deliverable.status = decision;
  deliverable.comment = comment;
  deliverable.decidedBy = req.user.name;
  deliverable.decidedAt = new Date();
  await deliverable.save();

  const verb = decision === 'approved' ? 'Approved' : 'Asked for changes to';
  await audit(req, 'deliverable.decided', `${verb} "${deliverable.title}"`, deliverable.clientId);
  res.json(deliverable);
});
