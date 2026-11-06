// Builds the Express app. Kept apart from server.js so the tests can use it directly.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { config } from './config.js';
import { HttpError } from './lib/access.js';
import { loadUser, requireLogin } from './middleware/auth.js';
import { apiLimiter, noStore, sameOriginOnly } from './middleware/security.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { billingRoutes } from './routes/billing.js';
import { adminRoutes } from './routes/admin.js';
import { accountRoutes } from './routes/account.js';
import { peopleRoutes } from './routes/people.js';
import { uploadRoutes } from './routes/uploads.js';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: config.isProd,
  }));
  // A demo with no public content has no reason to be in search results.
  app.use((_req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  const api = express.Router();
  api.use(noStore, apiLimiter, sameOriginOnly, express.json({ limit: '20kb' }));

  api.use(session({
    name: 'portal.sid',
    secret: config.sessionSecret,
    resave: false,
    // No cookie until someone signs in.
    saveUninitialized: false,
    proxy: true,
    store: MongoStore.create({
      client: mongoose.connection.getClient(),
      collectionName: 'sessions',
      ttl: config.sandboxHours * 60 * 60,
      autoRemove: 'native',
    }),
    cookie: {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: config.sandboxHours * 60 * 60 * 1000,
    },
  }));
  api.use(loadUser);

  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRoutes);

  // Everything below needs a signed-in user.
  api.use(requireLogin);
  api.use(projectRoutes);
  api.use(billingRoutes);
  api.use(adminRoutes);
  api.use(accountRoutes);
  api.use(peopleRoutes);
  api.use(uploadRoutes);

  api.use(() => {
    throw new HttpError(404, 'Not found');
  });

  app.use('/api', api);

  // The built React app. Hashed files never change, so they can be cached for a long time.
  app.use(express.static(DIST, {
    index: false,
    setHeaders(res, filePath) {
      const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
      res.set('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));
  app.get('/{*page}', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That is too large. Files can be up to 2 MB.' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid request' });
    }
    console.error(err);
    // Never send stack traces or database errors to the browser.
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
