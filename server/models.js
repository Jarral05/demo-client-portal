// The database collections.
//
// Two ideas run through all of them:
// - workspaceId: each visitor gets a private copy of the sample data (a "workspace").
// - clientId: which client company a record belongs to. Access checks depend on it.
//
// expiresAt lets MongoDB delete a visitor's copy by itself after it runs out.
import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const Id = Schema.Types.ObjectId;

// Never sent to the browser: secrets, hashes and file contents.
const HIDDEN_FIELDS = [
  'workspaceId', 'expiresAt', 'passwordHash', '__v', 'authVersion',
  'resetTokenHash', 'resetTokenExpires',
  'totpSecret', 'totpPendingSecret', 'totpLastStep', 'recoveryCodeHashes',
  'tokenHash', 'data',
];

function hideInternalFields(_doc, json) {
  for (const field of HIDDEN_FIELDS) delete json[field];
  return json;
}

function sandboxSchema(fields) {
  const schema = new Schema(
    {
      workspaceId: { type: Id, ref: 'Workspace', required: true, index: true },
      expiresAt: { type: Date, required: true },
      ...fields,
    },
    { timestamps: true, toJSON: { transform: hideInternalFields } },
  );
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return schema;
}

const workspaceSchema = new Schema(
  {
    expiresAt: { type: Date, required: true },
    brand: {
      name: { type: String, required: true },
      color: { type: String, required: true },
    },
  },
  { timestamps: true },
);
workspaceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Workspace = model('Workspace', workspaceSchema);

export const Client = model('Client', sandboxSchema({
  name: { type: String, required: true },
}));

const userSchema = sandboxSchema({
  email: { type: String, required: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['staff', 'client'], required: true },
  // Staff have no clientId. Client users always have one.
  clientId: { type: Id, ref: 'Client' },
  // A client user can read everything of theirs, but only approvers can sign work off.
  canApprove: { type: Boolean, default: false },
  // Goes up when the password is reset. Sessions remember the number they started
  // with, so every older session stops working at once.
  authVersion: { type: Number, default: 0 },
  // Password reset: only the hash of the emailed token, and when it runs out.
  resetTokenHash: { type: String, index: true },
  resetTokenExpires: Date,
  // Two-step sign-in with an authenticator app.
  totpEnabled: { type: Boolean, default: false },
  totpSecret: String,
  // Set while someone is scanning the QR code, before they prove it works.
  totpPendingSecret: String,
  // The last 30-second step used, so a code can't be replayed.
  totpLastStep: { type: Number, default: 0 },
  recoveryCodeHashes: { type: [String], default: undefined },
});
userSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
export const User = model('User', userSchema);

const milestoneSchema = new Schema({
  title: { type: String, required: true },
  status: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' },
  dueDate: Date,
});

export const Project = model('Project', sandboxSchema({
  clientId: { type: Id, ref: 'Client', required: true },
  name: { type: String, required: true },
  summary: String,
  dueDate: Date,
  milestones: [milestoneSchema],
}));

export const Deliverable = model('Deliverable', sandboxSchema({
  clientId: { type: Id, ref: 'Client', required: true },
  projectId: { type: Id, ref: 'Project', required: true },
  title: { type: String, required: true },
  note: String,
  status: { type: String, enum: ['pending', 'approved', 'changes_requested'], default: 'pending' },
  comment: String,
  decidedBy: String,
  decidedAt: Date,
}));

export const Message = model('Message', sandboxSchema({
  clientId: { type: Id, ref: 'Client', required: true },
  projectId: { type: Id, ref: 'Project', required: true },
  authorName: { type: String, required: true },
  authorRole: { type: String, required: true },
  body: { type: String, required: true },
}));

export const DocumentFile = model('DocumentFile', sandboxSchema({
  clientId: { type: Id, ref: 'Client', required: true },
  projectId: { type: Id, ref: 'Project', required: true },
  title: { type: String, required: true },
  kind: { type: String, required: true },
}));

export const Invoice = model('Invoice', sandboxSchema({
  clientId: { type: Id, ref: 'Client', required: true },
  projectId: { type: Id, ref: 'Project', required: true },
  number: { type: String, required: true },
  description: { type: String, required: true },
  amountCents: { type: Number, required: true },
  issuedAt: { type: Date, required: true },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
}));

// Files a visitor uploaded. The bytes live in the record itself (data), which is
// fine at 2 MB or less. MongoDB's limit for one record is 16 MB.
export const UploadedFile = model('UploadedFile', sandboxSchema({
  clientId: { type: Id, ref: 'Client', required: true },
  projectId: { type: Id, ref: 'Project', required: true },
  fileName: { type: String, required: true },
  // Worked out from the file's first bytes, never taken from the browser.
  mime: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  uploadedById: { type: Id, ref: 'User', required: true },
  uploadedByName: { type: String, required: true },
}));

// The demo's stand-in for email. A real portal would send these; here they appear
// on the Demo inbox page, so nothing reaches a real mailbox and nothing costs money.
export const InboxMessage = model('InboxMessage', sandboxSchema({
  to: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  // A path inside the portal, such as /reset-password#token=...
  link: String,
  linkLabel: String,
}));

export const Invite = model('Invite', sandboxSchema({
  email: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['staff', 'client'], required: true },
  clientId: { type: Id, ref: 'Client' },
  canApprove: { type: Boolean, default: false },
  invitedByName: { type: String, required: true },
  tokenHash: { type: String, required: true, index: true },
  validUntil: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'cancelled'], default: 'pending' },
}));

// The record of who did what. access.denied entries are refused attempts.
export const AuditEvent = model('AuditEvent', sandboxSchema({
  actorName: { type: String, required: true },
  action: { type: String, required: true },
  summary: { type: String, required: true },
  clientId: { type: Id, ref: 'Client' },
}));
