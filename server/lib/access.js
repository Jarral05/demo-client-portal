// The most important file in this project: who can see and do what.
//
// The rule: being logged in is not enough. Every read and write goes through
// scope(), so a client's query can only ever match that client's records.
import { AuditEvent } from '../models.js';
import { isTeam } from '../../shared/roles.js';

// field names the form box the message belongs to, so the screen can show it there.
export class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

// The database filter for "records this user may touch".
//
// It works like a guest list, not a list of banned people: only the roles named
// here get any records at all. Admin and staff see every client in their copy,
// and a client user sees one client. Anyone else, such as a new customer, is
// refused, so a forgotten role can never see everything by accident.
export function scope(user, extra = {}) {
  const filter = { workspaceId: user.workspaceId, ...extra };
  if (isTeam(user.role)) return filter;
  if (user.role === 'client' && user.clientId) {
    filter.clientId = user.clientId;
    return filter;
  }
  throw new HttpError(403, "Your account doesn't have access to any client's work yet.");
}

export function audit(req, action, summary, clientId) {
  return auditFor(req.user, action, summary, clientId);
}

// For events where nobody is signed in yet, such as asking for a reset link.
export function auditFor(user, action, summary, clientId) {
  return AuditEvent.create({
    workspaceId: user.workspaceId,
    expiresAt: user.expiresAt,
    actorName: user.name,
    action,
    summary,
    clientId,
  });
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Load one record, or answer 404.
//
// Another client's record gets the same 404 as one that doesn't exist. A 403
// would confirm the ID is real. The attempt is still written to the audit log.
export async function findOr404(Model, req, id, label) {
  if (!OBJECT_ID.test(id)) throw new HttpError(404, 'Not found');

  const record = await Model.findOne(scope(req.user, { _id: id }));
  if (record) return record;

  const existsForSomeoneElse = await Model.exists({ workspaceId: req.user.workspaceId, _id: id });
  if (existsForSomeoneElse) {
    await audit(req, 'access.denied', `Tried to open ${label} belonging to another client`);
  }
  throw new HttpError(404, 'Not found');
}
