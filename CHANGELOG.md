# Changelog

All notable changes are recorded here, in [Keep a Changelog](https://keepachangelog.com/) format.

## [1.1.0] - 2026-11-06

### Added

- Password reset by emailed link. In the demo, the "email" lands in a Demo inbox inside the portal, so nothing reaches a real mailbox. The link works once, for 30 minutes, and resetting signs out every other session.
- Two-step sign-in with an authenticator app, with 8 one-time recovery codes. Codes can't be reused, and 5 wrong codes end the attempt.
- People page for staff: see who can sign in, invite client users or staff, and cancel invitations. Invitations only go to made-up `.example` addresses, and the role comes from the invitation, never from the person accepting it.
- Shared files on each project: PDF, PNG or JPG up to 2 MB, checked by the file's content, not its name. Only people on the project can download them, always as a download. 5 per visit, with a cap on total storage.
- Security page, where anyone can turn two-step sign-in on or off.
- 38 new tests, including the RFC test values for the authenticator codes.

### Changed

- Sign-ins, password changes and refused attempts no longer show in a client's recent activity. Staff still see them in the Activity log.
- A request that is too large now answers 413 with a clear message, instead of 400.

## [1.0.3] - 2026-11-05

### Changed

- README: live demo link and screenshot at the top, and how AI tools are used.

## [1.0.2] - 2026-11-05

### Fixed

- The app now starts on hosts that load the entry file with `require()`. Top-level await prevented that.
- Clearer startup messages in the log, including why a start failed.

## [1.0.1] - 2026-11-05

### Fixed

- The screens now build during install, because Hostinger's Express setup has no Build command field.

## [1.0.0] - 2026-11-05

### Added

- Client portal demo: projects, milestones, sign-offs, messages, documents and invoices with PDF downloads.
- Four sample accounts: an approver, a read-only client user, a second client and agency staff.
- Access control enforced in every database query, with refused attempts written to an activity log.
- Access check page that runs real requests against the server and shows the answers.
- Branding page: the agency's name and colour replace the defaults across the portal.
- A private copy of the sample data for each visitor, deleted after 2 hours.
- Automated tests for what must not happen, run on every push.
