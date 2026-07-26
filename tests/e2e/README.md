# E2E Test Setup (Playwright)

This suite validates the core flow:
- teacher login
- create live session
- student join
- answer submission
- host finishes game

## Required Environment Variables

- `E2E_BASE_URL` (default: `http://localhost:5173`)
- `E2E_API_URL` (default: `http://localhost:4000`)
- `E2E_TEACHER_EMAIL`
- `E2E_TEACHER_PASSWORD`
- `E2E_STUDENT_EMAIL`
- `E2E_STUDENT_PASSWORD`
- `E2E_QUIZ_ID` (existing quiz owned by teacher)

## Run

```bash
npm install
npx playwright install
npm run e2e
```

## Notes

- The spec auto-skips when required env vars are missing.
- Use a dedicated test database and test accounts.
