// Who can sign in, and with what access.
// Staff see everyone and invite people. Only admins change roles or suspend accounts.
import { Router } from 'express';
import { Client, Invite, User, Workspace } from '../models.js';
import { audit, findOr404, HttpError } from '../lib/access.js';
import { sendToInbox } from '../lib/inbox.js';
import { newToken } from '../lib/tokens.js';
import { accessBody, inviteBody, parse } from '../lib/validate.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { config } from '../config.js';
import { ROLE_NAMES, ROLES } from '../../shared/roles.js';

export const peopleRoutes = Router();

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Loads someone in the admin's own copy, or answers 404.
async function personInCopy(req) {
  const person = OBJECT_ID.test(req.params.id)
    ? await User.findOne({ _id: req.params.id, workspaceId: req.user.workspaceId })
    : null;
  if (!person) throw new HttpError(404, 'Not found');
  // Nobody can change or suspend their own account. That also means there is
  // always at least one admin left: the one doing the changing.
  if (String(person._id) === String(req.user._id)) {
    throw new HttpError(409, "You can't change your own access. Ask another admin.");
  }
  return person;
}

// Admins only: change what someone can see and do.
peopleRoutes.put('/people/:id/access', requireAdmin, async (req, res) => {
  const person = await personInCopy(req);
  const { role, clientId, canApprove } = parse(accessBody, req.body);

  let client = null;
  if (role === 'client') {
    client = await Client.findOne({ workspaceId: req.user.workspaceId, _id: clientId });
    if (!client) throw new HttpError(400, 'Choose which client they belong to', 'clientId');
  }

  // Only client users belong to a company or sign off work.
  person.role = role;
  person.clientId = client?._id;
  person.canApprove = role === 'client' && Boolean(canApprove);
  await person.save();

  const access = client ? `${ROLES[role].label} at ${client.name}` : ROLES[role].label;
  await audit(req, 'people.access_changed', `Gave ${person.name} the role ${access}`, client?._id);
  res.json({ ok: true });
});

peopleRoutes.post('/people/:id/suspend', requireAdmin, async (req, res) => {
  const person = await personInCopy(req);
  person.suspended = true;
  await person.save();
  await audit(req, 'people.suspended', `Suspended ${person.name}`, person.clientId);
  res.json({ ok: true });
});

peopleRoutes.post('/people/:id/restore', requireAdmin, async (req, res) => {
  const person = await personInCopy(req);
  person.suspended = false;
  await person.save();
  await audit(req, 'people.restored', `Restored ${person.name}`, person.clientId);
  res.json({ ok: true });
});

peopleRoutes.get('/people', requireStaff, async (req, res) => {
  const { workspaceId } = req.user;
  const [found, invites, clients] = await Promise.all([
    User.find({ workspaceId }).sort({ name: 1 }),
    Invite.find({ workspaceId, status: 'pending' }).sort({ createdAt: -1 }),
    Client.find({ workspaceId }).sort({ name: 1 }),
  ]);
  const names = new Map(clients.map((client) => [String(client._id), client.name]));
  const clientName = (record) => (record.clientId ? names.get(String(record.clientId)) : null);

  // Admins first, customers last, so new sign-ups waiting for access are easy to spot.
  const users = found.sort((a, b) => ROLE_NAMES.indexOf(a.role) - ROLE_NAMES.indexOf(b.role));

  res.json({
    users: users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
      canApprove: user.canApprove,
      clientName: clientName(user),
      twoFactor: user.totpEnabled,
      emailVerified: user.emailVerified,
      suspended: user.suspended,
      isYou: String(user._id) === String(req.user._id),
    })),
    invites: invites.map((invite) => ({
      ...invite.toJSON(),
      clientName: clientName(invite),
      expired: invite.validUntil < new Date(),
    })),
    clients: clients.map(({ _id, name }) => ({ _id, name })),
  });
});

peopleRoutes.post('/invites', requireStaff, async (req, res) => {
  const { workspaceId } = req.user;
  const { name, email, role, clientId, canApprove } = parse(inviteBody, req.body);

  // A client user must belong to a client in this copy. A staff user has no client.
  let client = null;
  if (role === 'client') {
    client = await Client.findOne({ workspaceId, _id: clientId });
    if (!client) throw new HttpError(400, 'Choose which client they belong to');
  }

  const [existingUser, openInvite, inviteCount] = await Promise.all([
    User.exists({ workspaceId, email }),
    Invite.exists({ workspaceId, email, status: 'pending', validUntil: { $gt: new Date() } }),
    Invite.countDocuments({ workspaceId }),
  ]);
  if (existingUser) throw new HttpError(409, 'Someone with this email address already has an account.');
  if (openInvite) throw new HttpError(409, 'This person already has an invitation waiting.');
  if (inviteCount >= config.invitesPerCopy) {
    throw new HttpError(409, `This demo allows ${config.invitesPerCopy} invitations per visit.`);
  }

  const { token, hash } = newToken();
  const invite = await Invite.create({
    workspaceId,
    expiresAt: req.user.expiresAt,
    email,
    name,
    role,
    clientId: client?._id,
    canApprove: role === 'client' && Boolean(canApprove),
    invitedByName: req.user.name,
    tokenHash: hash,
    validUntil: new Date(Date.now() + config.inviteHours * 60 * 60 * 1000),
  });

  const workspace = await Workspace.findById(workspaceId);
  const joining = client ? ` for ${client.name}` : ' as staff';
  await sendToInbox(workspace, {
    to: email,
    subject: `${req.user.name} invited you to the ${workspace.brand.name} client portal`,
    body: `Hello ${name}, ${req.user.name} invited you to the ${workspace.brand.name} client portal${joining}. `
      + `Choose a password to join. The link works once, for ${config.inviteHours} hours.`,
    link: `/join#token=${token}`,
    linkLabel: 'Accept the invitation',
  });
  await audit(req, 'invite.sent', `Invited ${name} (${email})${joining}`, client?._id);
  res.status(201).json(invite);
});

peopleRoutes.delete('/invites/:id', requireStaff, async (req, res) => {
  const invite = await findOr404(Invite, req, req.params.id, 'an invitation');
  if (invite.status !== 'pending') throw new HttpError(409, 'This invitation was already used or cancelled.');
  invite.status = 'cancelled';
  await invite.save();
  await audit(req, 'invite.cancelled', `Cancelled the invitation for ${invite.email}`, invite.clientId);
  res.json({ ok: true });
});
