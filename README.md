# LevelNLearn

A real-time quiz platform for teachers and students — create quizzes, host live game sessions, and view detailed analytics reports.

## Architecture

Split into two independent workspaces:

| | Stack |
|---|---|
| **`/client`** | Vite · React 19 · React Router v6 · Zustand · Tailwind CSS · Framer Motion · Pusher JS |
| **`/server`** | Node.js · Express · MySQL (mysql2) · JWT · Pusher · Zod · bcryptjs |

## Getting Started

### Prerequisites

- Node.js 20+
- MySQL 8+ database
- [Pusher](https://pusher.com) account (Channels, not Beams)

### Server

```bash
cd server
cp .env.example .env   # fill in DB_*, JWT_SECRET, SMTP_*, PUSHER_* vars
npm install
npm run dev            # tsx watch on :4000
```

Environment variables needed in `server/.env`:

```
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=
JWT_SECRET=
MAIL_FROM=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=
ETHEREAL_USER=
ETHEREAL_PASS=
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=
GOOGLE_CLIENT_ID=
```

### Client

```bash
cd client
cp .env.example .env   # fill in VITE_API_URL, VITE_PUSHER_*, and VITE_GOOGLE_CLIENT_ID vars
npm install
npm run dev            # Vite dev server on :5173
```

Environment variables needed in `client/.env`:

```
VITE_API_URL=http://localhost:4000
VITE_PUSHER_KEY=
VITE_PUSHER_CLUSTER=
VITE_GOOGLE_CLIENT_ID=
```

### Database seed

```bash
cd server
npm run seed
```

## Scripts

| Location | Command | Purpose |
|---|---|---|
| `server/` | `npm run dev` | Start API server with hot reload |
| `server/` | `npm run build` | Compile TypeScript to `dist/` |
| `server/` | `npm start` | Run compiled server |
| `server/` | `npm run seed` | Seed database with sample data |
| `server/` | `npm test` | Run Vitest unit/integration suite |
| `client/` | `npm run dev` | Start Vite dev server |
| `client/` | `npm run build` | Production build to `client/dist/` |
| `client/` | `npm run preview` | Preview production build locally |
| root | `npm run e2e` | Run Playwright end-to-end tests |

## Key Features

- **Role-based access**: TEACHER and STUDENT roles with enforced SRM institutional email policy
- **Live game sessions**: Real-time question broadcast and answer collection via Pusher Channels
- **Host dashboard**: QR code join, live leaderboard, per-question timer control
- **Player view**: Animated answer selection, countdown timer, score reveal
- **Analytics**: Per-session leaderboard, question accuracy breakdown, cheat-flag detection, CSV export
- **Analytics Export**: Multi-sheet Excel report export with participant details and violations
- **Dark mode**: System-aware with manual toggle via `next-themes`

## Security

- Security hardening details and operational checklist: [SECURITY.md](./SECURITY.md)

## E2E Testing

Playwright configuration and environment setup are documented at [tests/e2e/README.md](./tests/e2e/README.md).

Quick run:

```bash
npm install
npx playwright install
npm run e2e
```

## Pre-Deploy QA

Run the critical release checks in [QA_PREDEPLOY_CHECKLIST.md](./QA_PREDEPLOY_CHECKLIST.md) before shipping.
