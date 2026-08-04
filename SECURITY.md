# Security Notes

This document summarizes implemented controls and recommended operational practices for LevelNLearn.

## Implemented Controls

### 1) Authentication and Token Safety
- JWT secret length is validated at startup (minimum 32 chars).
- Tokens expire after 7 days.
- Tokens are invalidated on password change (`passwordChangedAt` check in auth middleware).
- Login endpoint has in-memory brute-force throttling by `ip+email` with temporary lockout.

### 2) Transport and Header Hardening
- `helmet` is enabled.
- `x-powered-by` header is disabled.
- Restrictive API CSP is enabled (`default-src 'none'`, no framing, no form/object/base sources).

### 3) API Abuse Protection
- Auth routes are rate-limited with `skipSuccessfulRequests` to target failed attempts.
- General API rate limiter is enabled.

### 4) CORS Controls
- CORS is allow-list based using `CLIENT_ORIGIN` (comma-separated).
- Localhost and private LAN origins are allowed only in development.

### 5) Data Integrity / Quiz Safety
- Duplicate student responses are blocked with DB unique constraint.
- Session deletion is soft-delete (`deletedAt`) for auditability.
- Participant submission status and final score are persisted.

## Operational Recommendations

### JWT Rotation and Session Design
- Introduce short-lived access tokens (15-30 min) + refresh tokens.
- Store refresh tokens hashed in DB and rotate on every refresh.
- Revoke old refresh tokens on logout and suspicious activity.

### Password / Account Hardening
- Add optional MFA for teachers and admins.
- Add account lock + secure unlock workflow for repeated failed attempts.

### API and Frontend Security
- Add frontend CSP (in reverse proxy / static host), including strict `script-src` and `connect-src`.
- Ensure all cookies (if introduced) are `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
- Keep CORS allow-list strictly scoped to trusted domains in production.

### Monitoring and Incident Response
- Log auth failures, lockouts, and admin actions with IP/user-agent.
- Set alerting on unusual spikes in login failures or anti-cheat violations.

## Environment Checklist

Set these values in production:
- `NODE_ENV=production`
- `JWT_SECRET` (>= 32 chars, high entropy)
- `CLIENT_ORIGIN` (exact trusted origins only)
- `DB_*`, `PUSHER_*`, and SMTP credentials via secret manager

## Known Limitations

- Login throttle map is in-memory and resets on restart (works per process, not clustered/global).
- Full refresh-token rotation flow is not implemented yet.
- Playwright e2e requires seeded teacher/student accounts and a quiz id.
