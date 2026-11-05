# Changelog

All notable changes are recorded here, in [Keep a Changelog](https://keepachangelog.com/) format.

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
