import { User } from '../models.js';
import { audit, HttpError } from '../lib/access.js';

// Reads the session and loads the current user into req.user.
export async function loadUser(req, _res, next) {
  const { userId, workspaceId } = req.session ?? {};
  if (userId && workspaceId) {
    req.user = await User.findOne({ _id: userId, workspaceId });
  }
  next();
}

export function requireLogin(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Please sign in');
  next();
}

export async function requireStaff(req, _res, next) {
  if (req.user?.role !== 'staff') {
    await audit(req, 'access.denied', `Tried a staff-only action: ${req.method} ${req.path}`, req.user.clientId);
    throw new HttpError(403, 'Staff only');
  }
  next();
}
