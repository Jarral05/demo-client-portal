import { z } from 'zod';
import { HttpError } from './access.js';

// Every request body is checked against a schema before it's used. Because these
// fields must be plain strings, a database trick like {"email": {"$ne": null}} is
// refused here instead of reaching a query.
export function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    // A wrong type (an object where text belongs) gets a plain message, not zod's wording.
    const message = issue?.code === 'invalid_type' ? 'Please fill in every box.' : issue?.message;
    throw new HttpError(400, message ?? 'Invalid request', issue?.path?.[0]);
  }
  return result.data;
}

// Made-up addresses only. .example can never be a real mailbox, so a visitor
// can't make the demo store someone's real email address.
const exampleEmail = z.string().trim().toLowerCase().max(200)
  .regex(/^[^\s@]+@([a-z\d-]+\.)*[a-z\d-]+\.example$/, 'Use a made-up address ending in .example, like you@company.example. This demo never stores real email addresses.');

const personName = z.string().trim().min(1, 'Add your name').max(80, 'Keep the name under 80 characters');

export const registerBody = z.object({
  name: personName,
  email: exampleEmail,
  // Length only here. The fuller check (common passwords, your own name) runs after.
  password: z.string().max(200, 'Keep the password under 200 characters'),
  // A box hidden from people. Only bots fill it in.
  website: z.string().max(200).optional(),
});

export const profileBody = z.object({ name: personName });

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(200),
  newPassword: z.string().max(200, 'Keep the password under 200 characters'),
});

export const accessBody = z.object({
  role: z.enum(['admin', 'staff', 'client', 'customer']),
  clientId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  canApprove: z.boolean().optional(),
}).refine((value) => value.role !== 'client' || Boolean(value.clientId), {
  message: 'Choose which client they belong to',
  path: ['clientId'],
});

export const BRAND_COLORS = ['#14453A', '#1D3F72', '#5B2A5E', '#8A3B1E', '#2B2F33'];

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().max(200),
});

export const messageBody = z.object({
  body: z.string().trim().min(1, 'Write a message first').max(2000, 'Keep messages under 2,000 characters'),
});

export const decisionBody = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  comment: z.string().trim().max(1000, 'Keep comments under 1,000 characters').optional(),
}).refine((value) => value.decision === 'approved' || Boolean(value.comment), {
  message: 'Say what needs changing',
});

export const milestoneBody = z.object({
  status: z.enum(['todo', 'in_progress', 'done']),
});

export const deliverableBody = z.object({
  title: z.string().trim().min(1, 'Add a title').max(120, 'Keep the title under 120 characters'),
  note: z.string().trim().max(1000, 'Keep the note under 1,000 characters').optional(),
});

export const emailBody = z.object({
  email: z.string().trim().toLowerCase().max(200),
});

// Length only here. checkNewPassword() in passwords.js does the fuller check.
const newPassword = z.string().max(200, 'Keep the password under 200 characters');

// Reset and invitation links carry 64 hex characters.
const token = z.string().regex(/^[a-f\d]{64}$/, 'This link is incomplete. Open it again from the demo inbox.');

export const tokenBody = z.object({ token });
export const tokenPasswordBody = z.object({ token, password: newPassword });

// Turning two-step sign-in on needs a real code from the app.
export const totpCodeBody = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your app'),
});

// Signing in or turning it off also accepts a recovery code.
export const secondFactorBody = z.object({
  code: z.string().trim().toLowerCase()
    .regex(/^(\d{6}|[a-z\d]{5}-[a-z\d]{5})$/, 'Enter the 6-digit code, or a recovery code such as abcde-23456'),
});

// Invitations only go to made-up addresses, like sign-ups.
export const inviteBody = z.object({
  name: z.string().trim().min(1, 'Add a name').max(80, 'Keep the name under 80 characters'),
  email: exampleEmail,
  role: z.enum(['client', 'staff']),
  clientId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  canApprove: z.boolean().optional(),
}).refine((value) => value.role === 'staff' || Boolean(value.clientId), {
  message: 'Choose which client they belong to',
  path: ['clientId'],
});

export const brandBody = z.object({
  name: z.string().trim().min(1, 'Add a name').max(40, 'Keep the name under 40 characters'),
  color: z.enum(BRAND_COLORS),
});
