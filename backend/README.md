# TaskFlow Backend

Lightweight Express + SQLite API that replaces the previous Firebase usage. Data is stored in `taskflow.db` at the project root and seeded from `src/data/seed-data.ts` when empty.

## Quick start
- Install dependencies: `npm install`
- Run in dev mode: `npm run dev` (defaults to port `4000`)
- Optional env:
  - `PORT` to change the port
  - `ALLOWED_ORIGINS` as a comma-separated list for CORS (default allows all)
  - `APP_URL` (or `NEXT_PUBLIC_APP_URL`) for links in welcome emails
  - `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for outbound email

## API overview
- `POST /auth/login` → `{ token, user }`
- `GET /auth/me` → current user (requires `Authorization: Bearer <token>`)
- CRUD for companies, positions, users, projects, tasks, comments, clients, invoices
- `POST /tasks/mark-invoiced` to tag tasks with an invoice
- `POST /seed` to reset data back to the placeholders (also clears tokens)

Tokens are persisted in SQLite; restart with a new DB or call `/seed` to clear them.
