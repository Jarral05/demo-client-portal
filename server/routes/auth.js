import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Client, InboxMessage, Invite, User, Workspace } from '../models.js';
import { audit, auditFor, HttpError } from '../lib/access.js';
import { createWorkspace } from '../lib/workspace.js';
import { sendToInbox } from '../lib/inbox.js';
import { hashToken, newToken } from '../lib/tokens.js';
import { checkSecondFactor } from '../lib/twoFactor.js';
import {
  emailBody, loginBody, parse, registerBody, secondFactorBody, tokenBody, tokenPasswordBody,
} from '../lib/validate.js';
import { checkNewPassword, hashPassword } from '../lib/passwords.js';
import {
  linkLimiter, loginLimiter, registerLimiter, sandboxLimiter,
} from '../middleware/security.js';
import { regenerate, startSession } from '../middleware/auth.js';
import { config } from '../config.js';
import { DEFAULT_BRAND, PERSONAS, SAMPLE_PASSWORD } from '../lib/sampleData.js';

export const authRoutes = Router();

// Compared when no such user exists, so a wrong email takes as long as a wrong password.
const noUserHash = bcrypt.hash('no-such-user', 10);
// The same words for a wrong email and a wrong password, so this page can't be
// used to find out who has an account.
const BAD_LOGIN = {
  error: "That email and password don't match. Check for typos, or use Forgot your password.",
};
const SECOND_STEP_MINUTES = 5;
const SECOND_STEP_TRIES = 5;

const isPersona = (email) => PERSONAS.some((person) => person.email === email);

// The visitor's copy, if they have one and it hasn't expired.
async function currentWorkspaceId(req) {
  const { workspaceId } = req.session;
  if (workspaceId && (await Workspace.exists({ _id: workspaceId }))) return workspaceId;
  return null;
}

authRoutes.post('/login', loginLimiter, sandboxLimiter, async (req, res) => {
  const { email, password } = parse(loginBody, req.body);

  let workspaceId = await currentWorkspaceId(req);
  if (!workspaceId) {
    // First sign-in of a visit: make a private copy, but only for a sample account.
    const isSample = password === SAMPLE_PASSWORD && isPersona(email);
    if (!isSample) return res.status(401).json(BAD_LOGIN);
    workspaceId = await createWorkspace();
  }

  const user = await User.findOne({ workspaceId, email });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? (await noUserHash));
  if (!user || !passwordOk) return res.status(401).json(BAD_LOGIN);

  // These two are only said after a correct password, so they reveal nothing to a stranger.
  if (user.suspended) {
    throw new HttpError(403, 'This account is suspended. Ask an admin to restore it.');
  }
  if (!user.emailVerified) {
    await sendVerifyLink(user);
    return res.status(403).json({
      error: 'Please confirm your email address first. We sent a new link to the Demo inbox.',
      code: 'unverified',
    });
  }

  // A new session ID at login, so an ID planted before login is useless afterwards.
  await regenerate(req.session);
  req.session.workspaceId = workspaceId;

  // The password was right, but that's only the first step. The session remembers
  // who is halfway in, and nothing is reachable until the code is checked too.
  if (user.totpEnabled) {
    req.session.secondStep = {
      userId: String(user._id),
      tries: 0,
      until: Date.now() + SECOND_STEP_MINUTES * 60 * 1000,
    };
    return res.json({ ok: true, twoFactor: true });
  }

  startSession(req, user);
  await audit(req, 'auth.login', 'Signed in', user.clientId);
  res.json({ ok: true });
});

authRoutes.post('/two-factor', loginLimiter, async (req, res) => {
  const { code } = parse(secondFactorBody, req.body);
  const pending = req.session.secondStep;
  if (!pending || pending.until < Date.now()) {
    delete req.session.secondStep;
    throw new HttpError(401, 'Your sign-in timed out. Please enter your password again.');
  }

  const user = await User.findOne({ _id: pending.userId, workspaceId: req.session.workspaceId });
  const method = user?.totpEnabled ? await checkSecondFactor(user, code) : null;
  if (!method) {
    pending.tries += 1;
    if (pending.tries >= SECOND_STEP_TRIES) {
      delete req.session.secondStep;
      throw new HttpError(401, 'Too many wrong codes. Please enter your password again.');
    }
    throw new HttpError(401, 'That code is not right. Use the newest code in your app.');
  }

  const { workspaceId } = req.session;
  await regenerate(req.session);
  req.session.workspaceId = workspaceId;
  startSession(req, user);
  const how = method === 'recovery' ? 'a recovery code' : 'the authenticator app';
  await audit(req, 'auth.login', `Signed in with ${how}`, user.clientId);
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

// ---- Signing up ----

const VERIFY_HOURS = 24;

async function sendVerifyLink(user) {
  const { token, hash } = newToken();
  await User.updateOne(
    { _id: user._id },
    { $set: { verifyTokenHash: hash, verifyTokenExpires: new Date(Date.now() + VERIFY_HOURS * 60 * 60 * 1000) } },
  );
  const workspace = await Workspace.findById(user.workspaceId);
  await sendToInbox(workspace, {
    to: user.email,
    subject: 'Confirm your email address',
    body: `Welcome, ${user.name}. Confirm that ${user.email} is your address to finish setting up your account on the `
      + `${workspace.brand.name} client portal. The link works once, for ${VERIFY_HOURS} hours.`,
    link: `/verify-email#token=${token}`,
    linkLabel: 'Confirm my email',
  });
}

// One answer for every sign-up, whether the address is new or already taken.
// If it's taken, the owner of the address gets an email saying so, instead of the
// page telling a stranger "that email has an account".
const SIGNED_UP = {
  ok: true,
  message: 'Nearly done. Open the Demo inbox and click the link to confirm your email address.',
};

authRoutes.post('/register', registerLimiter, sandboxLimiter, async (req, res) => {
  const { name, email, password, website } = parse(registerBody, req.body);
  checkNewPassword(password, { name, email });

  // Only bots fill in the hidden "website" box. They get the normal answer and nothing is made.
  if (website) return res.json(SIGNED_UP);

  let workspaceId = await currentWorkspaceId(req);
  if (!workspaceId) {
    workspaceId = await createWorkspace();
    req.session.workspaceId = workspaceId;
  }
  const workspace = await Workspace.findById(workspaceId);

  const existing = await User.findOne({ workspaceId, email });
  if (existing) {
    await sendToInbox(workspace, {
      to: email,
      subject: 'You already have an account',
      body: `Someone tried to sign up with ${email}, which already has an account on the ${workspace.brand.name} client portal. `
        + "If it was you, sign in instead, or reset your password if you've forgotten it. If it wasn't you, you can ignore this email.",
      link: '/forgot-password',
      linkLabel: 'Reset my password',
    });
    return res.json(SIGNED_UP);
  }

  if ((await User.countDocuments({ workspaceId })) >= config.usersPerCopy) {
    throw new HttpError(409, `This demo allows ${config.usersPerCopy} accounts per visit.`);
  }

  // Every new account starts as a customer: signed in, but no client's work.
  // Only an admin can give it more.
  const user = await User.create({
    workspaceId,
    expiresAt: workspace.expiresAt,
    email,
    name,
    role: 'customer',
    emailVerified: false,
    passwordHash: await hashPassword(password),
  });
  await sendVerifyLink(user);
  await auditFor(user, 'auth.registered', 'Signed up as a customer');
  res.status(201).json(SIGNED_UP);
});

authRoutes.post('/verify', linkLimiter, async (req, res) => {
  const { token } = parse(tokenBody, req.body);
  const user = await User.findOneAndUpdate(
    { verifyTokenHash: hashToken(token), verifyTokenExpires: { $gt: new Date() } },
    { $set: { emailVerified: true }, $unset: { verifyTokenHash: 1, verifyTokenExpires: 1 } },
    { returnDocument: 'after' },
  );
  if (!user) throw new HttpError(400, 'This link has expired or was already used. Sign in, and we will send a new one.');
  if (user.suspended) throw new HttpError(403, 'This account is suspended. Ask an admin to restore it.');

  // Confirming the address also signs them in, the way most sites do.
  await regenerate(req.session);
  req.session.workspaceId = user.workspaceId;
  startSession(req, user);
  await audit(req, 'auth.email_verified', 'Confirmed their email address');
  res.json({ ok: true });
});

// ---- Password reset ----

// Always the same answer, whether or not the account exists, so this page can't
// be used to find out who has an account.
const RESET_SENT = {
  ok: true,
  message: 'If that address has an account, a reset link is on its way. Open the demo inbox to find it.',
};

authRoutes.post('/forgot', linkLimiter, sandboxLimiter, async (req, res) => {
  const { email } = parse(emailBody, req.body);

  let workspaceId = await currentWorkspaceId(req);
  if (!workspaceId && isPersona(email)) {
    // A visitor can try the reset before ever signing in, so make their copy now.
    workspaceId = await createWorkspace();
    req.session.workspaceId = workspaceId;
  }
  const user = workspaceId ? await User.findOne({ workspaceId, email }) : null;
  if (!user) return res.json(RESET_SENT);

  const { token, hash } = newToken();
  user.resetTokenHash = hash;
  user.resetTokenExpires = new Date(Date.now() + config.resetMinutes * 60 * 1000);
  await user.save();

  const workspace = await Workspace.findById(workspaceId);
  await sendToInbox(workspace, {
    to: user.email,
    subject: 'Reset your password',
    body: `Someone asked to reset the password for ${user.email} on the ${workspace.brand.name} client portal. `
      + `The link works once, for ${config.resetMinutes} minutes. If it wasn't you, ignore this email and your password stays the same.`,
    // After # the token stays in the browser: it isn't sent to the server or written to its logs.
    link: `/reset-password#token=${token}`,
    linkLabel: 'Choose a new password',
  });
  await auditFor(user, 'auth.reset_requested', 'Asked for a password reset link', user.clientId);
  res.json(RESET_SENT);
});

authRoutes.post('/reset', linkLimiter, async (req, res) => {
  const { token, password } = parse(tokenPasswordBody, req.body);

  // Check the password before using up the link, so a weak choice doesn't waste it.
  const pending = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpires: { $gt: new Date() } });
  if (!pending) throw new HttpError(400, 'This link has expired or was already used. Ask for a new one.');
  checkNewPassword(password, pending);

  // Find and use up the token in one step, so the same link can't work twice.
  const user = await User.findOneAndUpdate(
    { resetTokenHash: hashToken(token), resetTokenExpires: { $gt: new Date() } },
    { $unset: { resetTokenHash: 1, resetTokenExpires: 1 } },
  );
  if (!user) throw new HttpError(400, 'This link has expired or was already used. Ask for a new one.');

  // A new authVersion signs out every session that used the old password. The link
  // arrived by email, which also proves the address works.
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(password), emailVerified: true }, $inc: { authVersion: 1 } },
  );
  await auditFor(user, 'auth.password_reset', 'Reset their password with an emailed link', user.clientId);
  // Not signed in here: they sign in with the new password, and their code if two-step is on.
  res.json({ ok: true });
});

// ---- The demo inbox ----

// The "email" for this visitor's copy. Anyone holding the session sees all of it,
// because one visitor plays every sample person. A real portal sends real email.
authRoutes.get('/inbox', async (req, res) => {
  const workspaceId = await currentWorkspaceId(req);
  if (!workspaceId) return res.json([]);
  const messages = await InboxMessage.find({ workspaceId }).sort({ createdAt: -1 });
  res.json(messages);
});

// ---- Invitations ----

function findOpenInvite(token) {
  return Invite.findOne({ tokenHash: hashToken(token), status: 'pending', validUntil: { $gt: new Date() } });
}

const INVITE_GONE = 'This invitation has expired, was cancelled or was already used.';

// What the invitation page shows before the person chooses a password.
authRoutes.post('/invite/check', linkLimiter, async (req, res) => {
  const { token } = parse(tokenBody, req.body);
  const invite = await findOpenInvite(token);
  if (!invite) throw new HttpError(400, INVITE_GONE);

  const [workspace, client] = await Promise.all([
    Workspace.findById(invite.workspaceId),
    invite.clientId ? Client.findById(invite.clientId) : null,
  ]);
  res.json({
    name: invite.name,
    email: invite.email,
    role: invite.role,
    canApprove: invite.canApprove,
    clientName: client?.name ?? null,
    brandName: workspace?.brand.name ?? DEFAULT_BRAND.name,
    invitedByName: invite.invitedByName,
  });
});

authRoutes.post('/invite/accept', linkLimiter, async (req, res) => {
  const { token, password } = parse(tokenPasswordBody, req.body);

  // Check the password before using up the invitation, so a weak choice doesn't waste it.
  const open = await findOpenInvite(token);
  if (!open) throw new HttpError(400, INVITE_GONE);
  checkNewPassword(password, open);

  // Use up the invitation in one step, so two clicks can't make two accounts.
  const invite = await Invite.findOneAndUpdate(
    { tokenHash: hashToken(token), status: 'pending', validUntil: { $gt: new Date() } },
    { $set: { status: 'accepted' } },
  );
  if (!invite) throw new HttpError(400, INVITE_GONE);

  let user;
  try {
    // Role, client and permissions come from the invitation, never from this request.
    user = await User.create({
      workspaceId: invite.workspaceId,
      expiresAt: invite.expiresAt,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      clientId: invite.clientId,
      canApprove: invite.canApprove,
      passwordHash: await hashPassword(password),
    });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'Someone with this email address already has an account.');
    throw error;
  }

  await regenerate(req.session);
  req.session.workspaceId = invite.workspaceId;
  startSession(req, user);
  await audit(req, 'invite.accepted', `Accepted ${invite.invitedByName}'s invitation and joined`, user.clientId);
  res.json({ ok: true });
});
