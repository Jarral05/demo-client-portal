// All settings in one place. Secrets come from environment variables, never from code.
import { randomBytes } from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  for (const name of ['MONGODB_URI', 'SESSION_SECRET', 'PUBLIC_URL']) {
    if (!process.env[name]) {
      throw new Error(`${name} must be set in production.`);
    }
  }
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || '',
  // A random secret is fine locally: sessions just end when the server restarts.
  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  publicUrl: process.env.PUBLIC_URL || '',
  // How many proxies sit in front of the app. The rate limits need the real visitor IP.
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  sandboxHours: 2,
  maxSandboxes: Number(process.env.MAX_SANDBOXES) || 300,
};
