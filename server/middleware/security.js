import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { HttpError } from '../lib/access.js';

// Stops other websites sending requests with a visitor's cookie (CSRF).
// Browsers always send Origin on a POST. Other sites can't fake it.
export function sameOriginOnly(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  const allowed = config.publicUrl ? new URL(config.publicUrl).host : req.get('host');
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    host = '';
  }
  if (host !== allowed) throw new HttpError(403, 'Request refused');
  next();
}

// Private data must never sit in a browser, CDN or proxy cache.
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store, private');
  next();
}

const tooMany = { error: 'Too many attempts. Please wait a few minutes and try again.' };

// Slows password guessing. Successful logins don't count, so switching
// between demo accounts is never blocked.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooMany,
});

// Limits new sample-data copies per visitor. Someone with a copy already isn't counted.
export const sandboxLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  skip: (req) => Boolean(req.session?.workspaceId),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooMany,
});

// A general ceiling for the whole API.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooMany,
});
