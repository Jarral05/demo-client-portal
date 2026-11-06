# Changelog

All notable changes are recorded here, in [Keep a Changelog](https://keepachangelog.com/) format.

## [1.2.0] - 2026-11-06

### Added

- Sign-up page. New accounts start as Customer and must confirm their email through a link in the Demo inbox. Sign-ups only accept made-up `.example` addresses.
- Four roles: Admin, Staff, Client and Customer. A new Admin sample account, Lena Brooks.
- Admins can change anyone's access and suspend or restore accounts from the People page, except their own. A suspended person is signed out on their next click.
- Profile page: change your name, or your password (needs the current one, and signs out other devices).
- Show/Hide button on every password box, and a live strength meter on every new password.
- Password rules shared by the screens and the server: at least 10 characters, and no common passwords, keyboard patterns or your own name, company or email.
- Error messages in plain words, shown next to the box they belong to.
- Bot protection on sign-up: a hidden box only bots fill in, and a limit of 10 sign-ups an hour per visitor.
- 22 new tests.

### Changed

- Signing in now means typing an email and password. The sample accounts no longer sign in with one click: "Try a sample account" fills in the form.
- Signing up with an address that already has an account gives the normal answer, and the address's owner gets an email about it, so the page doesn't reveal who has an account.
- The access rule now fails closed: only Admin, Staff and Client users with a company can see any client's work. Any other role gets nothing.

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
