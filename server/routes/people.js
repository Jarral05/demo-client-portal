// Staff manage who can sign in: see everyone, invite people, cancel invitations.
import { Router } from 'express';
import { Client, Invite, User, Workspace } from '../models.js';
import { audit, findOr404, HttpError } from '../lib/access.js';
import { sendToInbox } from '../lib/inbox.js';
import { newToken } from '../lib/tokens.js';
import { inviteBody, parse } from '../lib/validate.js';
import { requireStaff } from '../middleware/auth.js';
import { config } from '../config.js';

export const peopleRoutes = Router();

peopleRoutes.get('/people', requireStaff, async (req, res) => {
  const { workspaceId } = req.user;
  const [users, invites, clients] = await Promise.all([
    User.find({ workspaceId }).sort({ role: -1, name: 1 }),
    Invite.find({ workspaceId, status: 'pending' }).sort({ createdAt: -1 }),
    Client.find({ workspaceId }).sort({ name: 1 }),
  ]);
  const names = new Map(clients.map((client) => [String(client._id), client.name]));
  const clientName = (record) => (record.clientId ? names.get(String(record.clientId)) : null);

  res.json({
    users: users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      canApprove: user.canApprove,
      clientName: clientName(user),
      twoFactor: user.totpEnabled,
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
