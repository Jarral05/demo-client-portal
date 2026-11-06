import { User } from '../models.js';
import { audit, HttpError } from '../lib/access.js';
import { isTeam } from '../../shared/roles.js';

// Reads the session and loads the current user into req.user.
//
// A session only counts if:
// - it started after the user's last password reset or change (authVersion), and
// - the account isn't suspended.
// The user is read fresh on every request, so a new role or a suspension
// takes effect on the very next click.
export async function loadUser(req, _res, next) {
  const { userId, workspaceId, authVersion = 0 } = req.session ?? {};
  if (userId && workspaceId) {
    const user = await User.findOne({ _id: userId, workspaceId });
    if (user && !user.suspended && authVersion === (user.authVersion ?? 0)) req.user = user;
  }
  next();
}

// Marks the session as signed in. Call regenerate() first, so the session ID changes.
export function startSession(req, user) {
  req.session.userId = user._id;
  req.session.authVersion = user.authVersion ?? 0;
  req.user = user;
}

export function regenerate(session) {
  return new Promise((resolve, reject) => session.regenerate((err) => (err ? reject(err) : resolve())));
}

export function requireLogin(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Please sign in');
  next();
}

async function refuse(req, what) {
  await audit(req, 'access.denied', `Tried ${what}: ${req.method} ${req.path}`, req.user.clientId);
  throw new HttpError(403, what === 'an admin-only action' ? 'Only an admin can do that.' : 'Only agency staff can do that.');
}

// Staff and admins: the agency's own people.
export async function requireStaff(req, _res, next) {
  if (!isTeam(req.user?.role)) await refuse(req, 'a staff-only action');
  next();
}

export async function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') await refuse(req, 'an admin-only action');
  next();
}
