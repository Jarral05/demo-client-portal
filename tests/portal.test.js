// Tests what must NOT happen as well as what should.
// A portal can pass every normal test and still show one client another client's files.
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { connectDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { SAMPLE_PASSWORD } from '../server/lib/sampleData.js';
import { Workspace } from '../server/models.js';

const ANNA = 'anna@alderfinch.example';
const TOM = 'tom@alderfinch.example';
const PRIYA = 'priya@harbourlane.example';
const SAM = 'sam@sampleagency.example';

let memory;
let app;
let visitorNumber = 0;

before(async () => {
  memory = await MongoMemoryServer.create();
  await connectDatabase(memory.getUri('test'));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  await memory.stop();
});

// Each visitor gets their own IP, so the rate limits don't leak between tests.
function newVisitor() {
  visitorNumber += 1;
  return request.agent(app).set('X-Forwarded-For', `203.0.113.${visitorNumber}`);
}

async function signInAs(agent, email) {
  await agent.post('/api/auth/logout').expect(200);
  await agent.post('/api/auth/login').send({ email, password: SAMPLE_PASSWORD }).expect(200);
  return agent;
}

// One visitor's copy of the data, with the IDs of Priya's records and Anna's.
async function setUp() {
  const agent = newVisitor();
  await signInAs(agent, PRIYA);
  const priya = await collectIds(agent);
  await signInAs(agent, ANNA);
  const anna = await collectIds(agent);
  return { agent, priya, anna };
}

async function collectIds(agent) {
  const projects = (await agent.get('/api/projects').expect(200)).body;
  const detail = (await agent.get(`/api/projects/${projects[0]._id}`).expect(200)).body;
  return {
    project: projects[0]._id,
    milestone: detail.project.milestones[0]._id,
    document: detail.documents[0]._id,
    invoice: detail.invoices[0]._id,
    deliverable: detail.deliverables.find((item) => item.status === 'pending')._id,
    projectNames: projects.map((project) => project.name),
  };
}

// ---- 1. Swap the ID ----

test("a client can't open another client's project, document or invoice", async () => {
  const { agent, priya } = await setUp();
  await agent.get(`/api/projects/${priya.project}`).expect(404);
  await agent.get(`/api/documents/${priya.document}/pdf`).expect(404);
  await agent.get(`/api/invoices/${priya.invoice}/pdf`).expect(404);
});

test("another client's record looks exactly like one that doesn't exist", async () => {
  const { agent, priya } = await setUp();
  const real = await agent.get(`/api/projects/${priya.project}`);
  const fake = await agent.get('/api/projects/64b000000000000000000000');
  assert.equal(real.status, fake.status);
  assert.deepEqual(real.body, fake.body);
});

test("a client can't write to another client's records", async () => {
  const { agent, priya } = await setUp();
  await agent.post(`/api/projects/${priya.project}/messages`).send({ body: 'hello' }).expect(404);
  await agent.post(`/api/deliverables/${priya.deliverable}/decision`).send({ decision: 'approved' }).expect(404);

  await signInAs(agent, PRIYA);
  const { body } = await agent.get(`/api/projects/${priya.project}`).expect(200);
  assert.equal(body.messages.some((message) => message.body === 'hello'), false);
  assert.equal(body.deliverables.find((item) => item._id === priya.deliverable).status, 'pending');
});

test('lists and the dashboard contain only the signed-in client', async () => {
  const { agent, priya, anna } = await setUp();
  assert.equal(anna.projectNames.some((name) => priya.projectNames.includes(name)), false);

  const invoices = (await agent.get('/api/invoices').expect(200)).body;
  assert.equal(invoices.some((invoice) => invoice._id === priya.invoice), false);

  const overview = (await agent.get('/api/overview').expect(200)).body;
  const text = JSON.stringify(overview);
  assert.equal(text.includes(priya.project), false);
  assert.equal(text.includes('Harbour Lane'), false);
  assert.equal(overview.projects.length, 2);
});

test("a client's activity feed leaves out other clients", async () => {
  const { agent, priya } = await setUp();
  await signInAs(agent, PRIYA);
  await agent.post(`/api/projects/${priya.project}/messages`).send({ body: 'From Priya' }).expect(201);

  await signInAs(agent, ANNA);
  const { recent } = (await agent.get('/api/overview').expect(200)).body;
  assert.equal(recent.some((event) => event.summary.includes('booking')), false);
});

// ---- 2. Copy a link and log out ----

test('signed-out visitors get nothing, including from direct download links', async () => {
  const { priya } = await setUp();
  const stranger = newVisitor();
  for (const path of [
    '/api/projects',
    '/api/overview',
    '/api/invoices',
    '/api/audit',
    '/api/demo/probes',
    `/api/projects/${priya.project}`,
    `/api/documents/${priya.document}/pdf`,
    `/api/invoices/${priya.invoice}/pdf`,
  ]) {
    await stranger.get(path).expect(401);
  }
  await stranger.post(`/api/projects/${priya.project}/messages`).send({ body: 'x' }).expect(401);
});

test('signing out ends access at once', async () => {
  const { agent, anna } = await setUp();
  await agent.get(`/api/documents/${anna.document}/pdf`).expect(200);
  await agent.post('/api/auth/logout').expect(200);
  await agent.get(`/api/documents/${anna.document}/pdf`).expect(401);
});

// ---- 3. Staff pages as a client ----

test('client accounts are refused every staff action', async () => {
  const { agent, anna } = await setUp();
  await agent.get('/api/audit').expect(403);
  await agent.get('/api/brand').expect(403);
  await agent.put('/api/brand').send({ name: 'Hacked', color: '#14453A' }).expect(403);
  await agent.post(`/api/invoices/${anna.invoice}/mark-paid`).expect(403);
  await agent.patch(`/api/projects/${anna.project}/milestones/${anna.milestone}`).send({ status: 'done' }).expect(403);
  await agent.post(`/api/projects/${anna.project}/deliverables`).send({ title: 'Mine' }).expect(403);
});

test('refused attempts are written to the activity log', async () => {
  const { agent, priya } = await setUp();
  await agent.get(`/api/projects/${priya.project}`).expect(404);
  await agent.get('/api/audit').expect(403);

  await signInAs(agent, SAM);
  const events = (await agent.get('/api/audit').expect(200)).body;
  const denied = events.filter((event) => event.action === 'access.denied' && event.actorName === 'Anna Reed');
  assert.equal(denied.length, 2);
});

// ---- Roles within one client ----

test('a read-only user can see and message, but cannot sign off', async () => {
  const { agent, anna } = await setUp();
  await signInAs(agent, TOM);
  await agent.get(`/api/projects/${anna.project}`).expect(200);
  await agent.post(`/api/projects/${anna.project}/messages`).send({ body: 'Thanks' }).expect(201);
  await agent.post(`/api/deliverables/${anna.deliverable}/decision`).send({ decision: 'approved' }).expect(403);
});

test('an approver can sign off once, and staff never can', async () => {
  const { agent, anna } = await setUp();
  await signInAs(agent, SAM);
  await agent.post(`/api/deliverables/${anna.deliverable}/decision`).send({ decision: 'approved' }).expect(403);

  await signInAs(agent, ANNA);
  const done = await agent.post(`/api/deliverables/${anna.deliverable}/decision`).send({ decision: 'approved' }).expect(200);
  assert.equal(done.body.status, 'approved');
  assert.equal(done.body.decidedBy, 'Anna Reed');
  await agent.post(`/api/deliverables/${anna.deliverable}/decision`).send({ decision: 'approved' }).expect(409);
});

test('asking for changes needs a comment', async () => {
  const { agent, anna } = await setUp();
  const url = `/api/deliverables/${anna.deliverable}/decision`;
  await agent.post(url).send({ decision: 'changes_requested' }).expect(400);
  const { body } = await agent.post(url).send({ decision: 'changes_requested', comment: 'Bigger logo' }).expect(200);
  assert.equal(body.comment, 'Bigger logo');
});

// ---- Staff ----

test('staff see every client and can do the staff actions', async () => {
  const { agent, anna, priya } = await setUp();
  await signInAs(agent, SAM);

  const projects = (await agent.get('/api/projects').expect(200)).body;
  assert.equal(projects.length, 3);
  assert.equal(new Set(projects.map((project) => project.clientName)).size, 2);

  await agent.get(`/api/projects/${priya.project}`).expect(200);
  await agent.patch(`/api/projects/${anna.project}/milestones/${anna.milestone}`).send({ status: 'in_progress' }).expect(200);
  await agent.patch(`/api/projects/${anna.project}/milestones/not-an-id`).send({ status: 'done' }).expect(404);
  await agent.post(`/api/projects/${anna.project}/deliverables`).send({ title: 'Footer design' }).expect(201);
  const paid = await agent.post(`/api/invoices/${priya.invoice}/mark-paid`).expect(200);
  assert.equal(paid.body.status, 'paid');
});

test('the brand can change, but only to an allowed colour', async () => {
  const { agent } = await setUp();
  await signInAs(agent, SAM);
  await agent.put('/api/brand').send({ name: 'Acme Web', color: 'url(evil)' }).expect(400);
  await agent.put('/api/brand').send({ name: 'Acme Web', color: '#1D3F72' }).expect(200);

  await signInAs(agent, ANNA);
  const { body } = await agent.get('/api/auth/session').expect(200);
  assert.deepEqual(body.brand, { name: 'Acme Web', color: '#1D3F72' });
});

// ---- Each visitor's copy is private ----

test("one visitor can't reach another visitor's copy, even as staff", async () => {
  const first = await setUp();
  await first.agent.post(`/api/projects/${first.anna.project}/messages`).send({ body: 'Rude words' }).expect(201);

  const second = newVisitor();
  await signInAs(second, SAM);
  await second.get(`/api/projects/${first.anna.project}`).expect(404);
  await second.get(`/api/documents/${first.anna.document}/pdf`).expect(404);

  const projects = (await second.get('/api/projects').expect(200)).body;
  for (const project of projects) {
    const { body } = await second.get(`/api/projects/${project._id}`).expect(200);
    assert.equal(body.messages.some((message) => message.body === 'Rude words'), false);
  }
});

test('the sign-in remembers the copy, so a second persona sees the first one\'s work', async () => {
  const { agent, anna } = await setUp();
  await agent.post(`/api/projects/${anna.project}/messages`).send({ body: 'See you Thursday' }).expect(201);
  await signInAs(agent, SAM);
  const { body } = await agent.get(`/api/projects/${anna.project}`).expect(200);
  assert.equal(body.messages.at(-1).body, 'See you Thursday');
});

test('a new copy is refused when the limit is reached', async () => {
  const saved = config.maxSandboxes;
  config.maxSandboxes = await Workspace.countDocuments();
  try {
    const res = await newVisitor().post('/api/auth/login').send({ email: ANNA, password: SAMPLE_PASSWORD });
    assert.equal(res.status, 503);
  } finally {
    config.maxSandboxes = saved;
  }
});

test('all records carry an expiry, and MongoDB is told to delete them', async () => {
  const indexes = await Promise.all(
    Object.values(mongoose.models).map(async (model) => [model.modelName, await model.collection.indexes()]),
  );
  for (const [name, list] of indexes) {
    assert.ok(list.some((index) => index.expireAfterSeconds === 0), `${name} has no expiry index`);
  }
});

// ---- Login ----

test('a wrong password or unknown email gets the same answer, and creates nothing', async () => {
  const before = await Workspace.countDocuments();
  const visitor = newVisitor();
  const wrongPassword = await visitor.post('/api/auth/login').send({ email: ANNA, password: 'nope' });
  const unknownEmail = await visitor.post('/api/auth/login').send({ email: 'x@example.com', password: SAMPLE_PASSWORD });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
  assert.equal(await Workspace.countDocuments(), before);
});

test('a wrong password is refused for a visitor who already has a copy', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/logout').expect(200);

  await visitor.post('/api/auth/login').send({ email: SAM, password: 'wrong' }).expect(401);
  const { body } = await visitor.get('/api/auth/session').expect(200);
  assert.equal(body.user, null);
});

test('a database trick in either login field is refused', async () => {
  const visitor = newVisitor();
  await signInAs(visitor, ANNA);
  await visitor.post('/api/auth/logout').expect(200);

  // Each field alone, with a valid value in the other, so one check can't hide a missing one.
  await visitor.post('/api/auth/login').send({ email: { $ne: null }, password: SAMPLE_PASSWORD }).expect(400);
  await visitor.post('/api/auth/login').send({ email: SAM, password: { $ne: null } }).expect(400);
  const { body } = await visitor.get('/api/auth/session').expect(200);
  assert.equal(body.user, null);
});

test('password guessing gets blocked', async () => {
  const visitor = newVisitor();
  const attempt = () => visitor.post('/api/auth/login').send({ email: ANNA, password: 'wrong' });
  for (let i = 0; i < 10; i += 1) await attempt().expect(401);
  await attempt().expect(429);
});

test('the session ID changes at sign-in', async () => {
  const visitor = newVisitor();
  const first = await visitor.post('/api/auth/login').send({ email: ANNA, password: SAMPLE_PASSWORD }).expect(200);
  const second = await visitor.post('/api/auth/login').send({ email: SAM, password: SAMPLE_PASSWORD }).expect(200);
  assert.notEqual(first.headers['set-cookie'][0].split(';')[0], second.headers['set-cookie'][0].split(';')[0]);
});

test('the session cookie is protected, and only set after signing in', async () => {
  const visitor = newVisitor();
  const before = await visitor.get('/api/auth/session').expect(200);
  assert.equal(before.headers['set-cookie'], undefined);
  assert.equal(before.body.user, null);

  const { headers } = await visitor.post('/api/auth/login').send({ email: ANNA, password: SAMPLE_PASSWORD }).expect(200);
  const cookie = headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

// ---- General protection ----

test('requests from another website are refused', async () => {
  const { agent, anna } = await setUp();
  await agent.post(`/api/projects/${anna.project}/messages`)
    .set('Origin', 'https://evil.example')
    .send({ body: 'forged' })
    .expect(403);
});

test('private answers are never cached', async () => {
  const { agent, anna } = await setUp();
  for (const path of ['/api/overview', `/api/projects/${anna.project}`, `/api/documents/${anna.document}/pdf`]) {
    const res = await agent.get(path).expect(200);
    assert.match(res.headers['cache-control'], /no-store/);
  }
});

test('password hashes and internal fields never leave the server', async () => {
  const { agent, anna } = await setUp();
  for (const path of ['/api/auth/session', '/api/auth/personas', '/api/overview', `/api/projects/${anna.project}`]) {
    const { text } = await agent.get(path).expect(200);
    assert.equal(text.includes('passwordHash'), false);
    assert.equal(text.includes('$2b$'), false);
    assert.equal(text.includes('workspaceId'), false);
  }
});

test('security headers are set', async () => {
  const { headers } = await newVisitor().get('/api/health').expect(200);
  assert.match(headers['content-security-policy'], /default-src 'self'/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-powered-by'], undefined);
  assert.match(headers['x-robots-tag'], /noindex/);
});

test('malformed requests get a clean error with no details', async () => {
  const { agent } = await setUp();
  const badJson = await agent.post('/api/auth/login').set('Content-Type', 'application/json').send('{oops');
  assert.equal(badJson.status, 400);
  assert.deepEqual(badJson.body, { error: 'Invalid request' });
  await agent.get('/api/projects/not-an-id').expect(404);
  await agent.get('/api/nothing-here').expect(404);
});

// ---- Documents ----

test('a client can download their own files as real PDFs', async () => {
  const { agent, anna } = await setUp();
  for (const path of [`/api/documents/${anna.document}/pdf`, `/api/invoices/${anna.invoice}/pdf`]) {
    const res = await agent.get(path).buffer(true).parse((stream, done) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => done(null, Buffer.concat(chunks)));
    }).expect(200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.equal(res.body.subarray(0, 4).toString(), '%PDF');
  }
});

// ---- Starting up ----

test('the app starts when the host loads it with require()', async () => {
  // Some hosts load the entry file this way. Top-level await anywhere would stop the app starting.
  const child = spawn(process.execPath, ['-e', "require('./server.js')"], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MONGODB_URI: memory.getUri('startup'),
      SESSION_SECRET: 'test-only',
      PUBLIC_URL: 'https://portal.example',
      PORT: '3987',
    },
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  const started = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 30000);
    child.stdout.on('data', () => {
      if (output.includes('listening on port 3987')) {
        clearTimeout(timer);
        resolve(true);
      }
    });
    child.on('exit', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  child.kill();
  assert.equal(started, true, output);
});

// ---- The Access check page ----

test('the probe route gives IDs only, and only to client accounts', async () => {
  const { agent, priya } = await setUp();
  const { body } = await agent.get('/api/demo/probes').expect(200);
  assert.equal(body.applicable, true);
  assert.equal(body.otherProject, priya.project);
  assert.equal(JSON.stringify(body).includes('Booking'), false);

  await signInAs(agent, SAM);
  const staff = await agent.get('/api/demo/probes').expect(200);
  assert.deepEqual(staff.body, { applicable: false });
});
