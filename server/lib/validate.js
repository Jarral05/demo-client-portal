import { z } from 'zod';
import { HttpError } from './access.js';

// Every request body is checked against a schema before it's used. Because these
// fields must be plain strings, a database trick like {"email": {"$ne": null}} is
// refused here instead of reaching a query.
export function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'Invalid request');
  return result.data;
}

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

export const brandBody = z.object({
  name: z.string().trim().min(1, 'Add a name').max(40, 'Keep the name under 40 characters'),
  color: z.enum(BRAND_COLORS),
});
