// Creates a visitor's private copy of the sample data.
//
// Visitors can't see each other's messages, and old copies delete themselves.
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { config } from '../config.js';
import { HttpError } from './access.js';
import { DEFAULT_BRAND, PERSONAS, SAMPLE_PASSWORD, daysFromNow, sampleClients } from './sampleData.js';
import {
  AuditEvent, Client, Deliverable, DocumentFile, Invoice, Message, Project, User, Workspace,
} from '../models.js';

// Hashed once: every copy has the same public sample password.
const passwordHash = bcrypt.hash(SAMPLE_PASSWORD, 10);

export async function createWorkspace() {
  // Protects the free database tier if the demo is ever hammered.
  if ((await Workspace.countDocuments()) >= config.maxSandboxes) {
    throw new HttpError(503, 'The demo is busy right now. Please try again in a few minutes.');
  }

  const expiresAt = new Date(Date.now() + config.sandboxHours * 60 * 60 * 1000);
  const workspace = await Workspace.create({ expiresAt, brand: DEFAULT_BRAND });
  const base = { workspaceId: workspace._id, expiresAt };

  const clients = sampleClients();
  const clientIds = {};
  const rows = { clients: [], projects: [], deliverables: [], messages: [], documents: [], invoices: [] };

  for (const [key, client] of Object.entries(clients)) {
    const clientId = new Types.ObjectId();
    clientIds[key] = clientId;
    rows.clients.push({ ...base, _id: clientId, name: client.name });

    for (const project of client.projects) {
      const projectId = new Types.ObjectId();
      const owned = { ...base, clientId, projectId };

      rows.projects.push({
        ...base,
        _id: projectId,
        clientId,
        name: project.name,
        summary: project.summary,
        dueDate: daysFromNow(project.dueIn),
        milestones: project.milestones.map(([title, status, due]) => ({ title, status, dueDate: daysFromNow(due) })),
      });
      for (const [title, note, status, decidedBy, decidedDay] of project.deliverables) {
        rows.deliverables.push({
          ...owned, title, note, status, decidedBy, decidedAt: decidedBy ? daysFromNow(decidedDay) : undefined,
        });
      }
      for (const [authorName, authorRole, body, day] of project.messages) {
        const at = daysFromNow(day);
        rows.messages.push({ ...owned, authorName, authorRole, body, createdAt: at, updatedAt: at });
      }
      for (const [title, kind] of project.documents) {
        rows.documents.push({ ...owned, title, kind });
      }
      for (const [number, description, amountCents, issued, due, status] of project.invoices) {
        rows.invoices.push({
          ...owned, number, description, amountCents, issuedAt: daysFromNow(issued), dueAt: daysFromNow(due), status,
        });
      }
    }
  }

  const hash = await passwordHash;
  const users = PERSONAS.map((person) => ({
    ...base,
    email: person.email,
    name: person.name,
    role: person.role,
    canApprove: person.canApprove,
    clientId: person.client ? clientIds[person.client] : undefined,
    passwordHash: hash,
  }));

  await Promise.all([
    Client.insertMany(rows.clients),
    Project.insertMany(rows.projects),
    Deliverable.insertMany(rows.deliverables),
    Message.insertMany(rows.messages),
    DocumentFile.insertMany(rows.documents),
    Invoice.insertMany(rows.invoices),
    User.insertMany(users),
    AuditEvent.create({
      ...base,
      actorName: 'System',
      action: 'workspace.created',
      summary: 'Sample data created for this visit',
    }),
  ]);

  return workspace._id;
}
