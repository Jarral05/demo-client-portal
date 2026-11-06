import { User } from '../models.js';
import { audit, HttpError } from '../lib/access.js';

// Reads the session and loads the current user into req.user.
//
// A session only counts if it started after the user's last password reset.
// Resetting a password raises authVersion, which signs out every older session.
export async function loadUser(req, _res, next) {
  const { userId, workspaceId, authVersion = 0 } = req.session ?? {};
  if (userId && workspaceId) {
    const user = await User.findOne({ _id: userId, workspaceId });
    if (user && authVersion === (user.authVersion ?? 0)) req.user = user;
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

export async function requireStaff(req, _res, next) {
  if (req.user?.role !== 'staff') {
    await audit(req, 'access.denied', `Tried a staff-only action: ${req.method} ${req.path}`, req.user.clientId);
    throw new HttpError(403, 'Staff only');
  }
  next();
}
