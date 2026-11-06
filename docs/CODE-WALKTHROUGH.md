# Code walkthrough

Read this to explain the project to someone. It takes about 20 minutes with the code open.

## The big picture

There are two programs:

- **The React app** (`client/src`) runs in the visitor's browser and draws the screens.
- **The Express server** (`server/`) runs on the host and is the only part that talks to MongoDB.

The browser can be changed by whoever is using it, so nothing it says is trusted. **The React app decides what to show. The server decides what's allowed.**

In production the server does both jobs: it answers `/api/...` and sends the built React files for everything else.

## Follow one request: Anna opens another client's project

Anna is signed in. She pastes a Harbour Lane project ID into the address:
`GET /api/projects/64f...`

Here's each step, in order.

**1. `server/app.js`: the shared steps.** Every API request goes through these first:

| Step | Why |
|---|---|
| `noStore` | Tells browsers and CDNs never to keep a copy |
| `apiLimiter` | Caps requests per minute from one visitor |
| `sameOriginOnly` | Refuses POST requests sent from another website |
| `express.json` | Reads the request body, up to 20 KB |
| `session` | Reads the `portal.sid` cookie and finds the session in MongoDB |
| `loadUser` | Loads Anna from the database into `req.user` |

**2. `requireLogin`.** Is there a `req.user`? If not, answer 401. That's why a copied link fails in a private window.

**3. The route, in `server/routes/projects.js`.**

```js
const project = await findOr404(Project, req, req.params.id, 'a project');
```

**4. `findOr404`, in `server/lib/access.js`. This is the key part.**

```js
const record = await Model.findOne(scope(req.user, { _id: id }));
```

`scope()` builds the database filter. For Anna it comes out like this:

```js
{ workspaceId: <her copy>, clientId: <Alder & Finch>, _id: '64f...' }
```

The project belongs to Harbour Lane, so nothing matches, and `record` is empty. Anna's `clientId` comes from her database record, not from anything she sent, so she can't change it.

**5. The refusal.** The server answers 404, the same as for a project that doesn't exist. A 403 would tell her the ID is real. The attempt also goes in the activity log, so staff can see it.

## Questions you might get

**Why not check ownership after loading the record?**
It's easy to forget one check in one route. Putting the owner in the query means a route has to go out of its way to get this wrong. The article this demo goes with describes exactly that failure: a check added in one place and missed in 11 others.

**Why sessions and not JWTs?**
A session lives in the database, so signing out ends it at once. A JWT stays valid until it expires unless you build extra machinery. For a portal, sessions are simpler and safer.

**How does the cookie stay safe?**
`httpOnly` means page scripts can't read it. `secure` means it only travels over HTTPS. `sameSite: 'lax'` means other sites can't send it with a POST. It's set in `server/app.js`.

**Why validate with zod?**
A login body like `{"email": {"$ne": null}}` is a known trick: passed straight to MongoDB, it means "any user". The schema in `server/lib/validate.js` insists on strings, so it's refused before any query runs.

**Can a client approve work through the API, even with the button hidden?**
Tom's screen has no Approve button, but that's only display. The server checks `req.user.canApprove` in `POST /deliverables/:id/decision`, and Tom gets 403. The Access check page shows this when you sign in as Tom.

**Why can't staff approve?**
Sign-off means the client agreed. If staff could click it, the record would prove nothing.

**How does a visitor get their own copy?**
`server/lib/workspace.js` makes one at the first sign-in. Every record has a `workspaceId`, which goes in the session and into every filter. Every record also has `expiresAt`, and MongoDB deletes it when that time passes.

**What stops someone filling the database?**
Three limits: new copies per visitor per hour (`sandboxLimiter`), the total number of copies (`MAX_SANDBOXES`), and the size of each request body and text field.

**How does password reset avoid being a way in?**
The link carries 32 random bytes that work once, for 30 minutes. The database keeps only their SHA-256 hash. The reply is the same whether or not the account exists, and a reset raises `authVersion`, which signs out every other session. See `POST /auth/forgot` and `POST /auth/reset` in `server/routes/auth.js`.

**How does two-step sign-in work without a third-party service?**
`server/lib/totp.js` implements RFC 6238 in about 40 lines, and the tests check it against the RFC's own test values. After a correct password, the session only records that a code is owed. Nothing is reachable until `POST /auth/two-factor` succeeds. Each 30-second step can be used once.

**Can an invited user give themselves more access?**
No. `POST /auth/invite/accept` creates the account from the saved invitation only. Extra fields in the request are dropped by the zod schema, and a test sends `role: 'staff'` to prove it.

**What stops a dangerous upload?**
`server/routes/uploads.js` reads the file's first bytes to decide its type, and the name must agree. Downloads go through `findOr404`, are sent as attachments, and carry a `sandbox` Content Security Policy.

**What would change for a real portal?**
- Remove the `workspaceId` copies and `expiresAt`, and the `/demo/probes` route.
- Send real email from `server/lib/inbox.js` instead of the Demo inbox.
- Move uploads to private file storage, with virus scanning, and encrypt the authenticator secrets.
- Require two-step sign-in for staff, and add backups.

**How do you know the tests really work?**
They were run against deliberately broken copies, with one protection switched off at a time, to confirm they fail: 23 protections for version 1.0, and 26 more for 1.1. A test that can't fail proves nothing.

## Try changing something

1. **Add a sample client:** add another entry in `server/lib/sampleData.js`, then add a persona for it.
2. **Break it on purpose:** in `scope()`, remove the `if (user.role === 'client')` line, then run `npm test`. Watch the tests fail. Put the line back.
3. **Add a field:** add `phone` to the `Client` model. Nothing leaks unless a route sends it.
