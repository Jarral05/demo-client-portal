// The most important file in this project: who can see and do what.
//
// The rule: being logged in is not enough. Every read and write goes through
// scope(), so a client's query can only ever match that client's records.
import { AuditEvent } from '../models.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// The database filter for "records this user may touch".
// Staff see every client in their workspace. A client user sees one client only.
export function scope(user, extra = {}) {
  const filter = { workspaceId: user.workspaceId, ...extra };
  if (user.role === 'client') filter.clientId = user.clientId;
  return filter;
}

export function audit(req, action, summary, clientId) {
  return AuditEvent.create({
    workspaceId: req.user.workspaceId,
    expiresAt: req.user.expiresAt,
    actorName: req.user.name,
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
