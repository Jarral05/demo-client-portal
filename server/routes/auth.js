import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Client, User, Workspace } from '../models.js';
import { audit } from '../lib/access.js';
import { createWorkspace } from '../lib/workspace.js';
import { loginBody, parse } from '../lib/validate.js';
import { loginLimiter, sandboxLimiter } from '../middleware/security.js';
import { DEFAULT_BRAND, PERSONAS, SAMPLE_PASSWORD } from '../lib/sampleData.js';

export const authRoutes = Router();

// Compared when no such user exists, so a wrong email takes as long as a wrong password.
const NO_USER_HASH = await bcrypt.hash('no-such-user', 10);
const BAD_LOGIN = { error: 'That email and password do not match.' };

function regenerate(session) {
  return new Promise((resolve, reject) => session.regenerate((err) => (err ? reject(err) : resolve())));
}

authRoutes.post('/login', loginLimiter, sandboxLimiter, async (req, res) => {
  const { email, password } = parse(loginBody, req.body);

  let workspaceId = req.session.workspaceId;
  if (workspaceId && !(await Workspace.exists({ _id: workspaceId }))) workspaceId = null;

  if (!workspaceId) {
    // First sign-in of a visit: make a private copy, but only for a sample account.
    const isSample = password === SAMPLE_PASSWORD && PERSONAS.some((person) => person.email === email);
    if (!isSample) return res.status(401).json(BAD_LOGIN);
    workspaceId = await createWorkspace();
  }

  const user = await User.findOne({ workspaceId, email });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? NO_USER_HASH);
  if (!user || !passwordOk) return res.status(401).json(BAD_LOGIN);

  // A new session ID at login, so an ID planted before login is useless afterwards.
  await regenerate(req.session);
  req.session.workspaceId = workspaceId;
  req.session.userId = user._id;

  req.user = user;
  await audit(req, 'auth.login', 'Signed in', user.clientId);
  res.json({ ok: true });
});

// Signs out but keeps the visitor's copy, so they can sign in as someone else and
// see what the last person did.
authRoutes.post('/logout', async (req, res) => {
  const { workspaceId } = req.session;
  await regenerate(req.session);
  if (workspaceId) req.session.workspaceId = workspaceId;
  res.json({ ok: true });
});

authRoutes.get('/session', async (req, res) => {
  const workspace = req.session.workspaceId ? await Workspace.findById(req.session.workspaceId) : null;
  const brand = workspace?.brand ?? DEFAULT_BRAND;

  if (!req.user) return res.json({ user: null, brand: { name: brand.name, color: brand.color } });

  const client = req.user.clientId
    ? await Client.findOne({ workspaceId: req.user.workspaceId, _id: req.user.clientId })
    : null;

  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      canApprove: req.user.canApprove,
      clientName: client?.name ?? null,
    },
    brand: { name: brand.name, color: brand.color },
    expiresAt: workspace?.expiresAt ?? null,
  });
});

// Public: what the login page shows. These are the made-up accounts.
authRoutes.get('/personas', (_req, res) => {
  res.json({
    password: SAMPLE_PASSWORD,
    personas: PERSONAS.map(({ email, name, company, role, label }) => ({ email, name, company, role, label })),
  });
});
