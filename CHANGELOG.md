# Changelog

All notable changes to this project are documented in this file.

## 2026-05-04

### Added
- Combined SQL migration file `server/db/schema/07-14_combined.sql`.
- Student results route/page flow for post-submission viewing.
- Backend unit/integration tests with Vitest + Supertest:
  - `server/test/scoring.test.ts`
  - `server/test/integration.sessions.test.ts`
  - `server/test/submit_state_result.test.ts`
- Playwright e2e scaffold:
  - `playwright.config.ts`
  - `tests/e2e/join-answer-finish.spec.ts`
  - `tests/e2e/README.md`
- Security baseline documentation in `SECURITY.md`.

### Changed
- Session submission hardening:
  - Prevent duplicate/late submissions.
  - Persist selected answer texts.
  - Add participant submission status metadata.
- Session lifecycle:
  - Added server state endpoint and participant result endpoint.
  - Soft-delete sessions with `deletedAt`.
- Scoring:
  - Added multi-select partial-credit and penalty logic.
- Host UI:
  - Polished UNANIMOUS mode status/progress UX and auto-advance feedback.
  - Improved accessibility labels on icon-only controls.
- Profile/Admin:
  - Completed `regNo` propagation in auth responses, profile update flow, and admin user table.
- Reports:
  - Clarified report "delete" as soft-archive behavior in UI text.
  - Removed stale `notes` type artifact from report model.

### Security
- Disabled Express `x-powered-by` header.
- Added restrictive API CSP headers via Helmet.
- Tuned auth limiter to count failed attempts (`skipSuccessfulRequests`).
- Added in-memory login brute-force lockout by `ip+email`.

### Notes
- E2E flow requires valid env vars and Playwright browser binaries (`npx playwright install`).
- Database migrations are expected to be run in order (or via combined migration file).
