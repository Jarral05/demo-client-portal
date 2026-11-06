// Version 1.2: sign-up, email confirmation, roles, suspension, profile and password rules.
// As in the other test files, most tests check what must NOT happen.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { connectDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { SAMPLE_PASSWORD } from '../server/lib/sampleData.js';
import { hashToken } from '../server/lib/tokens.js';
import { scope } from '../server/lib/access.js';
import { checkPassword } from '../shared/password.js';
import { User } from '../server/models.js';

const ANNA = 'anna@alderfinch.example';
const PRIYA = 'priya@harbourlane.example';
const SAM = 'sam@sampleagency.example';
const LENA = 'lena@sampleagency.example';
const GOOD = 'river-candle-orbit-mango';

let memory;
let app;
let visitorNumber = 0;

before(async () => {
  memory = await MongoMemoryServer.create();
  await connectDatabase(memory.getUri('roles'));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  await memory.stop();
});

function newVisitor() {
  visitorNumber += 1;
  return request.agent(app).set('X-Forwarded-For', `192.0.2.${visitorNumber}`);
}

async function signInAs(agent, email, password = SAMPLE_PASSWORD) {
  await agent.post('/api/auth/logout').expect(200);
  return (await agent.post('/api/auth/login').send({ email, password }).expect(200)).body;
}

async function inboxLink(agent, to, path) {
  const messages = (await agent.get('/api/auth/inbox').expect(200)).body;
  const message = messages.find((item) => item.to === to && item.link?.startsWith(path));
  assert.ok(message, `No ${path} message for ${to}`);
  return message.link.split('token=')[1];
}

// Signs up, confirms the email, and leaves the visitor signed in as the new customer.
async function signUp(agent, { name = 'Jordan Lee', email = 'jordan@newco.example', password = GOOD } = {}) {
  await agent.post('/api/auth/register').send({ name, email, password }).expect(201);
  const token = await inboxLink(agent, email, '/verify-email');
  await agent.post('/api/auth/verify').send({ token }).expect(200);
  return email;
}

async function personId(agent, email) {
  const { users } = (await agent.get('/api/people').expect(200)).body;
  return users.find((user) => user.email === email)._id;
}

async function clientIdByName(agent, prefix) {
  const { clients } = (await agent.get('/api/people').expect(200)).body;
  return clients.find((client) => client.name.startsWith(prefix))._id;
}

// ---- Password rules ----

test('the password rules refuse the guessable and allow the long', () => {
  const refused = ['short', 'password123', 'Password2026!', 'qwertyuiop12', '1234567890', 'aaaaaaaaaaaa', 'welcome-2026'];
  for (const value of refused) assert.equal(checkPassword(value).ok, false, value);
  assert.equal(checkPassword('jordan-rocks-2026', { name: 'Jordan Lee' }).ok, false);
  assert.equal(checkPassword('mysecret-newco-99', { email: 'x@newco.example' }).ok, false);

  assert.equal(checkPassword('mango-orbit-7').ok, true);
  assert.equal(checkPassword(GOOD).score >= 3, true);
  assert.equal(checkPassword('Tr4vel-Pl4ns!').label, 'Okay');
  assert.equal(checkPassword('mango-orbit-7').tips.length > 0, true);
});

// ---- Signing up ----

test('a new sign-up is a customer, and must confirm the email before signing in', async () => {
  const visitor = newVisitor();
  const created = await visitor.post('/api/auth/register')
    .send({ name: 'Jordan Lee', email: 'jordan@newco.example', password: GOOD })
    .expect(201);
  assert.match(created.body.message, /Demo inbox/);

  const early = await visitor.post('/api/auth/login').send({ email: 'jordan@newco.example', password: GOOD }).expect(403);
  assert.equal(early.body.code, 'unverified');
  await visitor.get('/api/account/security').expect(401);

  const token = await inboxLink(visitor, 'jordan@newco.example', '/verify-email');
  await visitor.post('/api/auth/verify').send({ token }).expect(200);
  const { user } = (await visitor.get('/api/auth/session').expect(200)).body;
  assert.equal(user.role, 'customer');
  await visitor.post('/api/auth/verify').send({ token }).expect(400);
});

test('an expired confirmation link is refused', async () => {
  const visitor = newVisitor();
  await visitor.post('/api/auth/register').send({ name: 'Kim Ro', email: 'kim@newco.example', password: GOOD }).expect(201);
  const token = await inboxLink(visitor, 'kim@newco.example', '/verify-email');
  await User.updateOne({ verifyTokenHash: hashToken(token) }, { verifyTokenExpires: new Date(Date.now() - 1000) });
  await visitor.post('/api/auth/verify').send({ token }).expect(400);
});

test('a customer reaches no client work at all', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const [annaProject] = (await visitor.get('/api/projects').expect(200)).body.map((project) => project._id);
  await signUp(visitor);

  for (const path of ['/api/projects', '/api/overview', '/api/invoices', `/api/projects/${annaProject}`, '/api/people', '/api/audit', '/api/brand']) {
    await visitor.get(path).expect(403);
  }
  await visitor.post(`/api/projects/${annaProject}/messages`).send({ body: 'hi' }).expect(403);
  // Their own settings still work.
  await visitor.get('/api/account/security').expect(200);
  await visitor.put('/api/account/profile').send({ name: 'Jordan L' }).expect(200);
});

test('signing up never sets the role: extra fields are ignored', async () => {
  const visitor = newVisitor();
  await visitor.post('/api/auth/register')
    .send({ name: 'Mal Lory', email: 'mal@newco.example', password: GOOD, role: 'admin', emailVerified: true })
    .expect(201);
  await visitor.post('/api/auth/login').send({ email: 'mal@newco.example', password: GOOD }).expect(403);
  const token = await inboxLink(visitor, 'mal@newco.example', '/verify-email');
  await visitor.post('/api/auth/verify').send({ token }).expect(200);
  assert.equal((await visitor.get('/api/auth/session').expect(200)).body.user.role, 'customer');
});

test('signing up with a taken email gives the same answer, makes nothing, and tells the owner', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const before = await User.countDocuments();
  const taken = await visitor.post('/api/auth/register').send({ name: 'Not Anna', email: ANNA, password: GOOD }).expect(200);
  const fresh = await visitor.post('/api/auth/register').send({ name: 'New Person', email: 'new@newco.example', password: GOOD }).expect(201);
  assert.equal(taken.body.message, fresh.body.message);
  assert.equal(await User.countDocuments(), before + 1);
  await signInAs(visitor, ANNA);
  const inbox = (await visitor.get('/api/auth/inbox').expect(200)).body;
  assert.ok(inbox.some((item) => item.to === ANNA && item.subject === 'You already have an account'));
});

test('weak passwords and real email addresses are refused, with the field named', async () => {
  const visitor = newVisitor();
  const weak = await visitor.post('/api/auth/register').send({ name: 'Jordan Lee', email: 'j@newco.example', password: 'password123' }).expect(400);
  assert.equal(weak.body.field, 'password');
  const personal = await visitor.post('/api/auth/register').send({ name: 'Jordan Lee', email: 'j@newco.example', password: 'jordan-rocks-2026' }).expect(400);
  assert.equal(personal.body.field, 'password');
  const real = await visitor.post('/api/auth/register').send({ name: 'Jordan Lee', email: 'jordan@gmail.com', password: GOOD }).expect(400);
  assert.equal(real.body.field, 'email');
  const noName = await visitor.post('/api/auth/register').send({ name: '  ', email: 'j@newco.example', password: GOOD }).expect(400);
  assert.equal(noName.body.field, 'name');
  assert.equal(await User.countDocuments({ email: 'j@newco.example' }), 0);
});

test('a bot that fills the hidden box gets the normal answer, and no account', async () => {
  const visitor = newVisitor();
  const res = await visitor.post('/api/auth/register')
    .send({ name: 'Bot', email: 'bot@spam.example', password: GOOD, website: 'http://spam.example' })
    .expect(200);
  assert.match(res.body.message, /Demo inbox/);
  assert.equal(await User.countDocuments({ email: 'bot@spam.example' }), 0);
});

test('sign-ups are limited per visitor and per copy', async () => {
  const visitor = newVisitor();
  await visitor.post('/api/auth/register').send({ name: 'First One', email: 'first@newco.example', password: GOOD }).expect(201);
  const saved = config.usersPerCopy;
  const { workspaceId } = await User.findOne({ email: 'first@newco.example' });
  // Set the cap to exactly the number of accounts already in this copy.
  config.usersPerCopy = await User.countDocuments({ workspaceId });
  try {
    await visitor.post('/api/auth/register').send({ name: 'Second One', email: 'second@newco.example', password: GOOD }).expect(409);
  } finally {
    config.usersPerCopy = saved;
  }

  const flooder = newVisitor();
  for (let i = 0; i < 10; i += 1) {
    await flooder.post('/api/auth/register').send({ name: 'Flood', email: `f${i}@newco.example`, password: 'short' });
  }
  await flooder.post('/api/auth/register').send({ name: 'Flood', email: 'last@newco.example', password: GOOD }).expect(429);
});

// ---- Roles ----

test('the access rule fails closed: unknown or incomplete roles get nothing', () => {
  const workspaceId = new mongoose.Types.ObjectId();
  assert.throws(() => scope({ workspaceId, role: 'customer' }), { status: 403 });
  assert.throws(() => scope({ workspaceId, role: 'client' }), { status: 403 });
  assert.throws(() => scope({ workspaceId, role: 'superuser' }), { status: 403 });
  assert.deepEqual(Object.keys(scope({ workspaceId, role: 'admin' })), ['workspaceId']);
});

test('an admin turns a customer into a client user, who then sees that client only', async () => {
  const visitor = newVisitor();
  await signUp(visitor);
  await signInAs(visitor, LENA);
  const jordan = await personId(visitor, 'jordan@newco.example');
  const alder = await clientIdByName(visitor, 'Alder');
  await visitor.put(`/api/people/${jordan}/access`).send({ role: 'client', clientId: alder, canApprove: false }).expect(200);

  await signInAs(visitor, 'jordan@newco.example', GOOD);
  const projects = (await visitor.get('/api/projects').expect(200)).body;
  assert.equal(projects.length, 2);
  assert.equal(JSON.stringify(projects).includes('Harbour'), false);
});

test('only admins change access or suspend: staff, clients and customers are refused', async () => {
  const visitor = newVisitor();
  await signUp(visitor);
  await signInAs(visitor, LENA);
  const jordan = await personId(visitor, 'jordan@newco.example');

  for (const email of [SAM, ANNA, PRIYA]) {
    await signInAs(visitor, email);
    await visitor.put(`/api/people/${jordan}/access`).send({ role: 'admin' }).expect(403);
    await visitor.post(`/api/people/${jordan}/suspend`).expect(403);
  }
  await signInAs(visitor, 'jordan@newco.example', GOOD);
  await visitor.put(`/api/people/${jordan}/access`).send({ role: 'admin' }).expect(403);
  assert.equal((await visitor.get('/api/auth/session').expect(200)).body.user.role, 'customer');
});

test("an admin can't change or suspend their own account", async () => {
  const visitor = newVisitor();
  await signInAs(visitor, LENA);
  const lena = await personId(visitor, LENA);
  const mine = await visitor.put(`/api/people/${lena}/access`).send({ role: 'customer' }).expect(409);
  assert.match(mine.body.error, /another admin/);
  await visitor.post(`/api/people/${lena}/suspend`).expect(409);
});

test('a client role needs a client from this copy', async () => {
  const other = newVisitor();
  await signInAs(other, LENA);
  const foreign = await clientIdByName(other, 'Harbour');

  const visitor = newVisitor();
  await signInAs(visitor, LENA);
  const anna = await personId(visitor, ANNA);
  const missing = await visitor.put(`/api/people/${anna}/access`).send({ role: 'client' }).expect(400);
  assert.equal(missing.body.field, 'clientId');
  await visitor.put(`/api/people/${anna}/access`).send({ role: 'client', clientId: foreign }).expect(400);
  await visitor.put('/api/people/64b000000000000000000000/access').send({ role: 'staff' }).expect(404);
});

test("an admin can't reach people in another visitor's copy", async () => {
  const first = newVisitor();
  await signInAs(first, LENA);
  const theirAnna = await personId(first, ANNA);

  const second = newVisitor();
  await signInAs(second, LENA);
  await second.post(`/api/people/${theirAnna}/suspend`).expect(404);
});

test('suspending signs the person out at once, and restoring lets them back in', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, LENA);
  const anna = await personId(visitor, ANNA);
  await visitor.post(`/api/people/${anna}/suspend`).expect(200);

  await visitor.post('/api/auth/logout').expect(200);
  const refused = await visitor.post('/api/auth/login').send({ email: ANNA, password: SAMPLE_PASSWORD }).expect(403);
  assert.match(refused.body.error, /suspended/);
  await visitor.get('/api/projects').expect(401);

  await signInAs(visitor, LENA);
  await visitor.post(`/api/people/${anna}/restore`).expect(200);
  await signInAs(visitor, ANNA);
  await visitor.get('/api/projects').expect(200);
});

test("a suspended person's open session stops working on the next request", async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.get('/api/projects').expect(200);
  const anna = await User.findOne({ email: ANNA }).sort({ createdAt: -1 });
  await User.updateOne({ _id: anna._id }, { suspended: true });
  await visitor.get('/api/projects').expect(401);
});

test('the admin is part of the agency team', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, LENA);
  assert.equal((await visitor.get('/api/projects').expect(200)).body.length, 3);
  await visitor.get('/api/audit').expect(200);
  await visitor.get('/api/brand').expect(200);
});

// ---- Profile ----

test('changing the password needs the current one, and signs out other sessions', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);

  const wrong = await visitor.post('/api/account/password').send({ currentPassword: 'nope', newPassword: GOOD }).expect(400);
  assert.equal(wrong.body.field, 'currentPassword');
  const weak = await visitor.post('/api/account/password').send({ currentPassword: SAMPLE_PASSWORD, newPassword: 'password123' }).expect(400);
  assert.equal(weak.body.field, 'newPassword');

  const before = (await User.findOne({ email: ANNA }).sort({ createdAt: -1 })).authVersion;
  await visitor.post('/api/account/password').send({ currentPassword: SAMPLE_PASSWORD, newPassword: GOOD }).expect(200);
  // This session stays signed in; the raised authVersion ends every other one.
  await visitor.get('/api/projects').expect(200);
  const afterChange = (await User.findOne({ email: ANNA }).sort({ createdAt: -1 })).authVersion;
  assert.equal(afterChange, before + 1);
  await signInAs(visitor, ANNA, GOOD);
});

test('an old session stops working after a password change elsewhere', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const anna = await User.findOne({ email: ANNA }).sort({ createdAt: -1 });
  await User.updateOne({ _id: anna._id }, { $inc: { authVersion: 1 } });
  await visitor.get('/api/projects').expect(401);
});

// ---- Weak passwords are refused everywhere a password is chosen ----

test('a weak password is refused on reset and invitation, and the link still works', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/forgot').send({ email: ANNA }).expect(200);
  const reset = await inboxLink(visitor, ANNA, '/reset-password');
  await visitor.post('/api/auth/reset').send({ token: reset, password: 'anna-reed-2026' }).expect(400);
  await visitor.post('/api/auth/reset').send({ token: reset, password: GOOD }).expect(200);

  await signInAs(visitor, SAM);
  const alder = await clientIdByName(visitor, 'Alder');
  await visitor.post('/api/invites').send({ name: 'Jo Bell', email: 'jo@alderfinch.example', role: 'client', clientId: alder }).expect(201);
  const invite = await inboxLink(visitor, 'jo@alderfinch.example', '/join');
  await visitor.post('/api/auth/invite/accept').send({ token: invite, password: 'qwertyuiop1' }).expect(400);
  await visitor.post('/api/auth/invite/accept').send({ token: invite, password: GOOD }).expect(200);
});

// ---- The sample accounts ----

test('the sample list includes an admin, and its password works only for sample people', async () => {
  const { body } = await newVisitor().get('/api/auth/personas').expect(200);
  assert.ok(body.personas.some((person) => person.email === LENA && person.role === 'admin'));
  await newVisitor().post('/api/auth/login').send({ email: 'jordan@newco.example', password: SAMPLE_PASSWORD }).expect(401);
});
