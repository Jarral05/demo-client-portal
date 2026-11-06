// "Sends" an email by putting it in the visitor's demo inbox.
//
// In a real portal this is the one function that would call an email service.
// Everything else (tokens, expiry, the links) works the same way.
import { InboxMessage } from '../models.js';

const INBOX_LIMIT = 50;

export async function sendToInbox(workspace, { to, subject, body, link, linkLabel }) {
  // A full inbox quietly stops taking mail, so nobody can grow the database by looping.
  if ((await InboxMessage.countDocuments({ workspaceId: workspace._id })) >= INBOX_LIMIT) return;
  await InboxMessage.create({
    workspaceId: workspace._id,
    expiresAt: workspace.expiresAt,
    to,
    subject,
    body,
    link,
    linkLabel,
  });
}
