// Version 1.1 features: password reset, two-step sign-in, invitations and uploads.
// As in portal.test.js, most tests check what must NOT happen.
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
import {
  base32Decode, base32Encode, hotp, stepAt, verifyTotp,
} from '../server/lib/totp.js';
import { cleanFileName } from '../server/routes/uploads.js';
import { checkSecondFactor } from '../server/lib/twoFactor.js';
import { Invite, User, Workspace } from '../server/models.js';

const ANNA = 'anna@alderfinch.example';
const TOM = 'tom@alderfinch.example';
const PRIYA = 'priya@harbourlane.example';
const SAM = 'sam@sampleagency.example';
const NEW_PASSWORD = 'a-brand-new-password';

const PDF = Buffer.from('%PDF-1.4\n% sample file for the demo\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const HTML = Buffer.from('<html><script>alert(document.cookie)</script></html>');

let memory;
let app;
let visitorNumber = 0;

before(async () => {
  memory = await MongoMemoryServer.create();
  await connectDatabase(memory.getUri('accounts'));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  await memory.stop();
});

function newVisitor() {
  visitorNumber += 1;
  return request.agent(app).set('X-Forwarded-For', `198.51.100.${visitorNumber}`);
}

async function signInAs(agent, email, password = SAMPLE_PASSWORD) {
  await agent.post('/api/auth/logout').expect(200);
  const { body } = await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return body;
}

async function inboxToken(agent, to, path) {
  const messages = (await agent.get('/api/auth/inbox').expect(200)).body;
  const message = messages.find((item) => item.to === to && item.link?.startsWith(path));
  assert.ok(message, `No ${path} message for ${to}`);
  return message.link.split('token=')[1];
}

async function projectIds(agent) {
  return (await agent.get('/api/projects').expect(200)).body.map((project) => project._id);
}

// The code an authenticator app would show, `ahead` steps from now.
function appCode(secret, ahead = 0) {
  return hotp(base32Decode(secret), stepAt(Date.now()) + ahead);
}

async function turnOnTwoFactor(agent) {
  const { secret } = (await agent.post('/api/account/two-factor/setup').expect(200)).body;
  const { recoveryCodes } = (await agent.post('/api/account/two-factor/enable').send({ code: appCode(secret) }).expect(200)).body;
  return { secret, recoveryCodes };
}

function upload(agent, projectId, data, name, type = 'application/pdf') {
  return agent.post(`/api/projects/${projectId}/uploads`)
    .set('Content-Type', type)
    .set('X-File-Name', encodeURIComponent(name))
    .send(data);
}

function asBuffer(req) {
  return req.buffer(true).parse((stream, done) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => done(null, Buffer.concat(chunks)));
  });
}

// ---- The authenticator code maths, against the official test values ----

test('HOTP matches the RFC 4226 test values', () => {
  const key = Buffer.from('12345678901234567890');
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  expected.forEach((code, counter) => assert.equal(hotp(key, counter), code));
});

test('TOTP matches the RFC 6238 test values', () => {
  const key = Buffer.from('12345678901234567890');
  const expected = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037']];
  for (const [seconds, code] of expected) assert.equal(hotp(key, stepAt(seconds * 1000), 8), code);
});

test('base32 matches the RFC 4648 values and round-trips', () => {
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  assert.equal(base32Decode('MZXW6YTBOI').toString(), 'foobar');
  assert.equal(base32Encode(Buffer.from('12345678901234567890')), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
});

test('a code is accepted one step either side, but not two, and never twice', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  const timeMs = 1_700_000_000_000;
  const now = stepAt(timeMs);
  const code = (step) => hotp(base32Decode(secret), step);
  assert.equal(verifyTotp(secret, code(now), { timeMs }), now);
  assert.equal(verifyTotp(secret, code(now - 1), { timeMs }), now - 1);
  assert.equal(verifyTotp(secret, code(now + 1), { timeMs }), now + 1);
  assert.equal(verifyTotp(secret, code(now - 2), { timeMs }), null);
  assert.equal(verifyTotp(secret, code(now + 2), { timeMs }), null);
  assert.equal(verifyTotp(secret, code(now), { timeMs, lastStep: now }), null);
});

// ---- Password reset ----

test('asking for a reset gives the same answer for real and unknown addresses', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const real = await visitor.post('/api/auth/forgot').send({ email: TOM }).expect(200);
  const unknown = await visitor.post('/api/auth/forgot').send({ email: 'nobody@alderfinch.example' }).expect(200);
  assert.deepEqual(real.body, unknown.body);

  const inbox = (await visitor.get('/api/auth/inbox').expect(200)).body;
  assert.equal(inbox.some((item) => item.to === 'nobody@alderfinch.example'), false);
  assert.equal(inbox.some((item) => item.to === TOM), true);
});

test('the reset link changes the password, and the old one stops working', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/logout').expect(200);
  await visitor.post('/api/auth/forgot').send({ email: ANNA }).expect(200);
  const token = await inboxToken(visitor, ANNA, '/reset-password');

  await visitor.post('/api/auth/reset').send({ token, password: NEW_PASSWORD }).expect(200);
  await visitor.post('/api/auth/login').send({ email: ANNA, password: SAMPLE_PASSWORD }).expect(401);
  await signInAs(visitor, ANNA, NEW_PASSWORD);
});

test('a reset link works once, and not after it expires', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/forgot').send({ email: ANNA }).expect(200);
  const used = await inboxToken(visitor, ANNA, '/reset-password');
  await visitor.post('/api/auth/reset').send({ token: used, password: NEW_PASSWORD }).expect(200);
  await visitor.post('/api/auth/reset').send({ token: used, password: 'yet-another-password' }).expect(400);

  await visitor.post('/api/auth/forgot').send({ email: TOM }).expect(200);
  const late = await inboxToken(visitor, TOM, '/reset-password');
  await User.updateOne({ resetTokenHash: hashToken(late) }, { resetTokenExpires: new Date(Date.now() - 1000) });
  await visitor.post('/api/auth/reset').send({ token: late, password: NEW_PASSWORD }).expect(400);
});

test('only the newest reset link works', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/forgot').send({ email: TOM }).expect(200);
  const first = await inboxToken(visitor, TOM, '/reset-password');
  await visitor.post('/api/auth/forgot').send({ email: TOM }).expect(200);
  await visitor.post('/api/auth/reset').send({ token: first, password: NEW_PASSWORD }).expect(400);
});

test('made-up and malformed reset tokens are refused', async () => {
  const visitor = newVisitor();
  await visitor.post('/api/auth/reset').send({ token: 'a'.repeat(64), password: NEW_PASSWORD }).expect(400);
  await visitor.post('/api/auth/reset').send({ token: { $ne: null }, password: NEW_PASSWORD }).expect(400);
  await visitor.post('/api/auth/reset').send({ token: 'short', password: NEW_PASSWORD }).expect(400);
});

test('a new password must be at least 10 characters', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/forgot').send({ email: ANNA }).expect(200);
  const token = await inboxToken(visitor, ANNA, '/reset-password');
  await visitor.post('/api/auth/reset').send({ token, password: 'short' }).expect(400);
  // The link still works after a refused attempt.
  await visitor.post('/api/auth/reset').send({ token, password: NEW_PASSWORD }).expect(200);
});

test('resetting the password signs out every other session at once', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/forgot').send({ email: ANNA }).expect(200);
  const token = await inboxToken(visitor, ANNA, '/reset-password');
  await visitor.get('/api/projects').expect(200);

  // The link is used from another browser, as if the account had been taken over.
  await newVisitor().post('/api/auth/reset').send({ token, password: NEW_PASSWORD }).expect(200);
  await visitor.get('/api/projects').expect(401);
});

test('a reset before signing in makes a copy only for a sample account', async () => {
  const before = await Workspace.countDocuments();
  await newVisitor().post('/api/auth/forgot').send({ email: 'someone@gmail.com' }).expect(200);
  assert.equal(await Workspace.countDocuments(), before);

  const visitor = newVisitor();
  await visitor.post('/api/auth/forgot').send({ email: PRIYA }).expect(200);
  assert.equal(await Workspace.countDocuments(), before + 1);
  const token = await inboxToken(visitor, PRIYA, '/reset-password');
  await visitor.post('/api/auth/reset').send({ token, password: NEW_PASSWORD }).expect(200);
  await signInAs(visitor, PRIYA, NEW_PASSWORD);
});

test("one visitor can't read another visitor's inbox", async () => {
  const first = newVisitor();
  await signInAs(first, ANNA);
  await first.post('/api/auth/forgot').send({ email: ANNA }).expect(200);

  const second = newVisitor();
  assert.deepEqual((await second.get('/api/auth/inbox').expect(200)).body, []);
  await signInAs(second, SAM);
  const inbox = (await second.get('/api/auth/inbox').expect(200)).body;
  assert.equal(inbox.length, 0);
});

// ---- Two-step sign-in ----

test('two-step sign-in only turns on with a correct code from the app', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const { secret } = (await visitor.post('/api/account/two-factor/setup').expect(200)).body;
  const wrong = appCode(secret) === '000000' ? '111111' : '000000';
  await visitor.post('/api/account/two-factor/enable').send({ code: wrong }).expect(400);
  assert.equal((await visitor.get('/api/account/security').expect(200)).body.twoFactor, false);

  await visitor.post('/api/account/two-factor/enable').send({ code: appCode(secret) }).expect(200);
  assert.equal((await visitor.get('/api/account/security').expect(200)).body.twoFactor, true);
});

test('with two-step on, the password alone reaches nothing', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const { secret } = await turnOnTwoFactor(visitor);

  const first = await signInAs(visitor, ANNA);
  assert.equal(first.twoFactor, true);
  await visitor.get('/api/projects').expect(401);
  const session = (await visitor.get('/api/auth/session').expect(200)).body;
  assert.equal(session.user, null);

  await visitor.post('/api/auth/two-factor').send({ code: appCode(secret, 1) }).expect(200);
  await visitor.get('/api/projects').expect(200);
});

test('the second step needs the first: a code alone gets nothing', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const { secret } = await turnOnTwoFactor(visitor);
  await visitor.post('/api/auth/logout').expect(200);
  await visitor.post('/api/auth/two-factor').send({ code: appCode(secret, 1) }).expect(401);
  await visitor.get('/api/projects').expect(401);
});

test('a used code is refused the second time', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const { secret } = await turnOnTwoFactor(visitor);
  const code = appCode(secret, 1);

  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/two-factor').send({ code }).expect(200);
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/two-factor').send({ code }).expect(401);
  await visitor.get('/api/projects').expect(401);
});

test('racing requests: a code passes once, and an older code never winds the clock back', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const { secret } = (await visitor.post('/api/account/two-factor/setup').expect(200)).body;
  const { recoveryCodes } = (await visitor.post('/api/account/two-factor/enable')
    .send({ code: appCode(secret, -1) }).expect(200)).body;

  // Both requests read the user before either one saved, as happens in a race.
  const stale = await User.findOne({ totpSecret: secret });
  const same = appCode(secret, 1);
  const twice = await Promise.all([checkSecondFactor(stale, same), checkSecondFactor(stale, same)]);
  assert.equal(twice.filter(Boolean).length, 1);

  // The slower request carries the older code. It must fail, and must not move
  // the last-used step backwards, which would let the newer code work again.
  assert.equal(await checkSecondFactor(stale, appCode(secret, 0)), null);
  const saved = await User.findOne({ totpSecret: secret });
  assert.equal(saved.totpLastStep, stepAt(Date.now()) + 1);

  const recovery = await Promise.all([checkSecondFactor(stale, recoveryCodes[2]), checkSecondFactor(stale, recoveryCodes[2])]);
  assert.equal(recovery.filter(Boolean).length, 1);
});

test('a recovery code works once', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const { recoveryCodes } = await turnOnTwoFactor(visitor);
  assert.equal(recoveryCodes.length, 8);

  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/two-factor').send({ code: recoveryCodes[0] }).expect(200);
  assert.equal((await visitor.get('/api/account/security').expect(200)).body.recoveryCodesLeft, 7);
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/two-factor').send({ code: recoveryCodes[0] }).expect(401);
});

test('five wrong codes end the attempt, even if the next code is right', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const { secret } = await turnOnTwoFactor(visitor);
  await signInAs(visitor, ANNA);
  const right = appCode(secret, 1);
  const wrong = right === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i += 1) await visitor.post('/api/auth/two-factor').send({ code: wrong }).expect(401);
  await visitor.post('/api/auth/two-factor').send({ code: right }).expect(401);
  await visitor.get('/api/projects').expect(401);
});

test('a password reset does not get round two-step sign-in', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await turnOnTwoFactor(visitor);
  await visitor.post('/api/auth/logout').expect(200);
  await visitor.post('/api/auth/forgot').send({ email: ANNA }).expect(200);
  const token = await inboxToken(visitor, ANNA, '/reset-password');
  await visitor.post('/api/auth/reset').send({ token, password: NEW_PASSWORD }).expect(200);

  const login = await visitor.post('/api/auth/login').send({ email: ANNA, password: NEW_PASSWORD }).expect(200);
  assert.equal(login.body.twoFactor, true);
  await visitor.get('/api/projects').expect(401);
});

test('turning two-step off needs a code', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  const { recoveryCodes } = await turnOnTwoFactor(visitor);
  await visitor.post('/api/account/two-factor/disable').send({}).expect(400);
  await visitor.post('/api/account/two-factor/disable').send({ code: 'zzzzz-zzzzz' }).expect(400);
  await visitor.post('/api/account/two-factor/disable').send({ code: recoveryCodes[1] }).expect(200);
  const login = await signInAs(visitor, ANNA);
  assert.equal(login.twoFactor, undefined);
});

test('the authenticator secret never leaves the server after setup', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, SAM);
  const { secret, recoveryCodes } = await turnOnTwoFactor(visitor);
  for (const path of ['/api/auth/session', '/api/account/security', '/api/people', '/api/audit']) {
    const { text } = await visitor.get(path).expect(200);
    assert.equal(text.includes(secret), false, path);
    assert.equal(text.includes(recoveryCodes[0]), false, path);
    assert.equal(/totpSecret|totpPending|recoveryCodeHashes|resetToken|tokenHash/.test(text), false, path);
  }
});

// ---- Invitations ----

async function staffInvite(agent, body, status) {
  const people = (await agent.get('/api/people').expect(200)).body;
  const alder = people.clients.find((client) => client.name.startsWith('Alder'));
  return agent.post('/api/invites').send({ clientId: alder._id, role: 'client', ...body }).expect(status);
}

test('clients can neither see the people list nor invite anyone', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.get('/api/people').expect(403);
  await visitor.post('/api/invites').send({ name: 'Eve', email: 'eve@x.example', role: 'staff' }).expect(403);
});

test('an invited person joins with the role and client from the invitation only', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, PRIYA);
  const priyaProjects = await projectIds(visitor);
  await signInAs(visitor, SAM);
  await staffInvite(visitor, { name: 'Jo Bell', email: 'jo@alderfinch.example', canApprove: false }, 201);
  const token = await inboxToken(visitor, 'jo@alderfinch.example', '/join');

  const check = (await visitor.post('/api/auth/invite/check').send({ token }).expect(200)).body;
  assert.equal(check.clientName, 'Alder & Finch Accountants');

  // Extra fields in the request are ignored: the role comes from the invitation.
  await visitor.post('/api/auth/invite/accept')
    .send({ token, password: NEW_PASSWORD, role: 'staff', canApprove: true })
    .expect(200);
  const { user } = (await visitor.get('/api/auth/session').expect(200)).body;
  assert.equal(user.email, 'jo@alderfinch.example');
  assert.equal(user.role, 'client');
  assert.equal(user.canApprove, false);
  for (const id of priyaProjects) await visitor.get(`/api/projects/${id}`).expect(404);
  await visitor.get('/api/people').expect(403);
});

test('an invitation works once, and not once cancelled or expired', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, SAM);
  await staffInvite(visitor, { name: 'One', email: 'one@alderfinch.example' }, 201);
  const once = await inboxToken(visitor, 'one@alderfinch.example', '/join');
  await visitor.post('/api/auth/invite/accept').send({ token: once, password: NEW_PASSWORD }).expect(200);
  await visitor.post('/api/auth/invite/accept').send({ token: once, password: NEW_PASSWORD }).expect(400);

  await signInAs(visitor, SAM);
  const { body: invite } = await staffInvite(visitor, { name: 'Two', email: 'two@alderfinch.example' }, 201);
  const cancelled = await inboxToken(visitor, 'two@alderfinch.example', '/join');
  await visitor.delete(`/api/invites/${invite._id}`).expect(200);
  await visitor.post('/api/auth/invite/check').send({ token: cancelled }).expect(400);
  await visitor.post('/api/auth/invite/accept').send({ token: cancelled, password: NEW_PASSWORD }).expect(400);

  await staffInvite(visitor, { name: 'Three', email: 'three@alderfinch.example' }, 201);
  const late = await inboxToken(visitor, 'three@alderfinch.example', '/join');
  await Invite.updateOne({ tokenHash: hashToken(late) }, { validUntil: new Date(Date.now() - 1000) });
  await visitor.post('/api/auth/invite/accept').send({ token: late, password: NEW_PASSWORD }).expect(400);
});

test('invitations only go to made-up .example addresses', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, SAM);
  for (const email of ['someone@gmail.com', 'x@example.com', 'x@company.example.com', 'not-an-email']) {
    await staffInvite(visitor, { name: 'Real Person', email }, 400);
  }
  const inbox = (await visitor.get('/api/auth/inbox').expect(200)).body;
  assert.equal(inbox.length, 0);
});

test("an invitation can't name a client from someone else's copy", async () => {
  const other = newVisitor();
  await signInAs(other, SAM);
  const foreignClient = (await other.get('/api/people').expect(200)).body.clients[0]._id;

  const visitor = newVisitor();
  await signInAs(visitor, SAM);
  await visitor.post('/api/invites')
    .send({ name: 'Mallory', email: 'm@x.example', role: 'client', clientId: foreignClient })
    .expect(400);
});

test('no duplicate accounts or invitations, and a cap per visit', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, SAM);
  await staffInvite(visitor, { name: 'Anna again', email: ANNA }, 409);
  await staffInvite(visitor, { name: 'Kim', email: 'kim@alderfinch.example' }, 201);
  await staffInvite(visitor, { name: 'Kim', email: 'kim@alderfinch.example' }, 409);
  for (let i = 1; i < config.invitesPerCopy; i += 1) {
    await staffInvite(visitor, { name: `Person ${i}`, email: `p${i}@alderfinch.example` }, 201);
  }
  await staffInvite(visitor, { name: 'One too many', email: 'extra@alderfinch.example' }, 409);
});

// ---- Uploads ----

async function annaAndPriya() {
  const agent = newVisitor();
  await signInAs(agent, PRIYA);
  const [priyaProject] = await projectIds(agent);
  await signInAs(agent, ANNA);
  const [annaProject] = await projectIds(agent);
  return { agent, annaProject, priyaProject };
}

test('a client uploads a file, and gets the same bytes back as a download', async () => {
  const { agent, annaProject } = await annaAndPriya();
  const { body: file } = await upload(agent, annaProject, PDF, 'Signed letter.pdf').expect(201);
  assert.equal(file.mime, 'application/pdf');
  assert.equal(file.data, undefined);

  const detail = await agent.get(`/api/projects/${annaProject}`).expect(200);
  assert.equal(detail.body.uploads.length, 1);
  assert.equal(detail.text.includes('"data"'), false);

  const res = await asBuffer(agent.get(`/api/uploads/${file._id}`)).expect(200);
  assert.deepEqual(res.body, PDF);
  assert.match(res.headers['content-disposition'], /^attachment/);
  assert.match(res.headers['content-security-policy'], /sandbox/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['cache-control'], /no-store/);
});

test("a client can't upload to, download from or delete another client's files", async () => {
  const { agent, annaProject, priyaProject } = await annaAndPriya();
  await upload(agent, priyaProject, PDF, 'sneaky.pdf').expect(404);

  await signInAs(agent, PRIYA);
  const { body: priyaFile } = await upload(agent, priyaProject, PDF, 'x-ray.pdf').expect(201);
  await signInAs(agent, ANNA);
  await agent.get(`/api/uploads/${priyaFile._id}`).expect(404);
  await agent.delete(`/api/uploads/${priyaFile._id}`).expect(404);
  const detail = (await agent.get(`/api/projects/${annaProject}`).expect(200)).body;
  assert.equal(detail.uploads.length, 0);
});

test('signed-out visitors and other visitors get nothing from an upload link', async () => {
  const { agent, annaProject } = await annaAndPriya();
  const { body: file } = await upload(agent, annaProject, PDF, 'private.pdf').expect(201);
  await newVisitor().get(`/api/uploads/${file._id}`).expect(401);

  const other = newVisitor();
  await signInAs(other, SAM);
  await other.get(`/api/uploads/${file._id}`).expect(404);

  await agent.post('/api/auth/logout').expect(200);
  await agent.get(`/api/uploads/${file._id}`).expect(401);
});

test('a file is judged by its content, not its name or the type the browser claims', async () => {
  const { agent, annaProject } = await annaAndPriya();
  await upload(agent, annaProject, HTML, 'invoice.pdf').expect(415);
  await upload(agent, annaProject, HTML, 'page.html', 'text/html').expect(415);
  await upload(agent, annaProject, PDF, 'page.html', 'text/html').expect(415);
  await upload(agent, annaProject, PNG, 'photo.pdf').expect(415);
  await upload(agent, annaProject, PDF, 'no-extension').expect(415);
  await upload(agent, annaProject, Buffer.alloc(0), 'empty.pdf').expect(400);
  await upload(agent, annaProject, PNG, 'photo.png', 'application/octet-stream').expect(201);
});

test('files over 2 MB are refused', async () => {
  const { agent, annaProject } = await annaAndPriya();
  const big = Buffer.concat([PDF, Buffer.alloc(config.uploadMaxBytes)]);
  await upload(agent, annaProject, big, 'big.pdf').expect(413);
});

test('each visit keeps at most 5 uploads', async () => {
  const { agent, annaProject } = await annaAndPriya();
  for (let i = 0; i < config.uploadsPerCopy; i += 1) await upload(agent, annaProject, PDF, `f${i}.pdf`).expect(201);
  await upload(agent, annaProject, PDF, 'one-more.pdf').expect(409);
});

test('uploads stop when total storage for all visitors is full', async () => {
  const saved = config.uploadTotalBytes;
  config.uploadTotalBytes = 1;
  try {
    const { agent, annaProject } = await annaAndPriya();
    await upload(agent, annaProject, PDF, 'full.pdf').expect(503);
  } finally {
    config.uploadTotalBytes = saved;
  }
});

test('only the uploader or staff can delete a file', async () => {
  const { agent, annaProject } = await annaAndPriya();
  const { body: file } = await upload(agent, annaProject, PDF, 'annas.pdf').expect(201);
  await signInAs(agent, TOM);
  await agent.get(`/api/uploads/${file._id}`).expect(200);
  await agent.delete(`/api/uploads/${file._id}`).expect(403);
  await signInAs(agent, SAM);
  await agent.delete(`/api/uploads/${file._id}`).expect(200);
  await agent.get(`/api/uploads/${file._id}`).expect(404);
});

test('file names are cleaned: no folders, no odd characters', () => {
  assert.equal(cleanFileName(encodeURIComponent('../../etc/passwd.pdf')), 'passwd.pdf');
  assert.equal(cleanFileName(encodeURIComponent('..\\..\\boot.ini.pdf')), 'boot.ini.pdf');
  assert.equal(cleanFileName(encodeURIComponent('<script>.pdf')), '_script_.pdf');
  assert.equal(cleanFileName(encodeURIComponent('.hidden.pdf')), 'hidden.pdf');
  assert.equal(cleanFileName('%E0%A4%A'), 'file');
  assert.ok(cleanFileName(encodeURIComponent(`${'a'.repeat(300)}.pdf`)).endsWith('.pdf'));
});

// ---- Every new route needs a signed-in user ----

test('signed-out visitors are refused every new private route', async () => {
  const stranger = newVisitor();
  for (const path of ['/api/people', '/api/account/security']) await stranger.get(path).expect(401);
  await stranger.post('/api/account/two-factor/setup').expect(401);
  await stranger.post('/api/invites').send({ name: 'x', email: 'x@x.example', role: 'staff' }).expect(401);
  await stranger.post('/api/projects/64b000000000000000000000/uploads').send(PDF).expect(401);
});
