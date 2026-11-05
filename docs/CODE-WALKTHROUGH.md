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

**What would change for a real portal?**
- Remove the `workspaceId` copies and `expiresAt`, and the `/demo/probes` route.
- Add password reset, invitations, file uploads to private storage, and email.
- Add two-factor login for staff, and backups.

**How do you know the tests really work?**
They were run against a deliberately broken copy, with the access checks switched off, to confirm they fail. A test that can't fail proves nothing.

## Try changing something

1. **Add a sample client:** add another entry in `server/lib/sampleData.js`, then add a persona for it.
2. **Break it on purpose:** in `scope()`, remove the `if (user.role === 'client')` line, then run `npm test`. Watch the tests fail. Put the line back.
3. **Add a field:** add `phone` to the `Client` model. Nothing leaks unless a route sends it.
