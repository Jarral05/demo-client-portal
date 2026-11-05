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

const HIDDEN_FIELDS = ['workspaceId', 'expiresAt', 'passwordHash', '__v'];

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

// The record of who did what. access.denied entries are refused attempts.
export const AuditEvent = model('AuditEvent', sandboxSchema({
  actorName: { type: String, required: true },
  action: { type: String, required: true },
  summary: { type: String, required: true },
  clientId: { type: Id, ref: 'Client' },
}));
