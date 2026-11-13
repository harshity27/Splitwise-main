AI_CONTEXT.md
===============

This file is the single source-of-truth for the SW_app project. It captures product understanding, scoped requirements, architecture, implementation decisions, database schema, API design, frontend structure, deployment plan, testing plan, trade-offs, prompt history, changes made during implementation, and known limitations.

Use it to reproduce the app with an AI assistant or to onboard another developer to the codebase.

---

## 1. Initial prompt

The project started from the following prompt:

```text
You are a junior engineer helping me complete an internship assignment.
The assignment is to reverse engineer Splitwise, scope a realistic 3-day version,
and build a working deployed app.
Important instructions:
1. Do not assume product requirements.
2. Do not jump directly into implementation.
3. Ask me detailed questions about product scope, UX, workflows, edge cases, and
engineering decisions.
4. Ask about every implementation detail needed to build the app.
5. After each answer I give, update a Markdown file called AI_CONTEXT.md.
6. AI_CONTEXT.md must become the source of truth for the entire project.
7. The final app must be buildable from AI_CONTEXT.md.
8. Another evaluator should be able to paste AI_CONTEXT.md into the same AI tool
and recreate a similar app.
9. Before writing code, produce a build plan based only on the agreed context.
10. During implementation, keep updating AI_CONTEXT.md whenever requirements,
architecture, schema, UI, or logic changes.
11. Do not recommend technical solutions. Your job is to let me think through the
technical solution.
Start by interviewing me.
Ask questions across product goals, Splitwise research, core workflows, user personas, MVP scope, out-of-scope features, data model, authentication, groups, expenses, settlements, balance calculation, UI screens, routing, frontend architecture, backend architecture, database choice, API design, deployment, testing, known risks, tradeoffs.
Do not give me a final plan until you have asked enough questions.
```

This document is written from the working repository and should be enough for a recreated app to match the current implementation.

---

## 2. Product understanding

### 2.1 What this app is

SW_app is a 3-day internship MVP that mimics Splitwise for shared expense tracking. It is designed for small groups to log expenses, split costs, view balances, invite friends, and settle payments.

### 2.2 Core user problem

People need a fast, lightweight way to split group expenses with friends and family without doing manual math. This project focuses on capturing group expense data, calculating who owes whom, and surfacing suggested payments.

### 2.3 Primary personas

- **Individual user**: tracks personal expenses in groups and wants to know balances.
- **Group admin**: creates groups, invites members, and manages shared expenses.

### 2.4 MVP goals

- Provide secure signup/login.
- Let users create and join groups.
- Capture expenses and split them accurately.
- Compute balances and suggest settlements.
- Allow user profile editing.

### 2.5 MVP out of scope

- Real payment integration (Stripe, UPI, PayPal).
- Production-grade media storage for avatars.
- Full multi-tenant or scale-ready architecture.
- Formal audit logging beyond the activity feed.

---

## 3. Tech stack

### Frontend

- React 19
- Vite
- react-router-dom
- Tailwind CSS (minimal styling support)

### Backend

- Node.js 20+ (ESM)
- Express 4.x
- sqlite / sqlite3
- bcryptjs
- jsonwebtoken
- dotenv
- cors

### Tools

- npm
- nodemon for local reloads
- Docker + docker-compose for containerized local deployment

---

## 4. Architecture

### 4.1 Runtime architecture

- `SW_frontend`: React SPA served by Vite during development.
- `SW_backend`: Express JSON API with SQLite persistence.
- JWT tokens store authentication state.
- Frontend fetches backend APIs through `SW_frontend/src/lib/api.js`.
- `docker-compose.yml` packages both services and persists SQLite in a Docker volume.

### 4.2 System boundaries

- Public pages: Home, Login, Signup.
- Protected app pages: Dashboard, Activity, All Expenses, Group Detail.
- Backend APIs require JWT auth for protected resources.

### 4.3 Data flow

1. User signs up / logs in.
2. Backend returns JWT.
3. Frontend stores JWT in `localStorage.sw_token`.
4. Protected API calls add `Authorization: Bearer <token>`.
5. Backend validates token with `requireAuth` middleware.
6. Backend reads/writes SQLite tables.
7. Frontend refreshes view after actions via bootstrap or specific endpoints.

---

## 5. Engineering requirements

- Backend should be configurable via `.env`.
- Frontend should consume `VITE_API_URL`.
- Database schema should auto-create and migrate missing columns.
- Sensitive configuration should not be hardcoded into source.
- API responses should use consistent JSON and status codes.

---

## 6. Deployment plan

### Local development

Use the checked-in environment files and defaults:

- Backend: `SW_backend/.env` with `PORT=5000`, `CORS_ORIGIN=http://localhost:5174`, `JWT_SECRET=...`
- Frontend: `SW_frontend/.env` with `VITE_API_URL=http://localhost:5000`, `VITE_PORT=5174`

Commands:

```bash
cd SW_frontend
npm install
npm run dev

cd ../SW_backend
npm install
npm run dev
```

Open the app at `http://localhost:5174`.

### Docker deployment

Use `docker-compose.yml` in the repo root:

```bash
cp .env.example .env
docker compose up --build
```

- Backend is exposed on host port `4001` and container port `4000`.
- Frontend is exposed on host port `8088`.

### Production recommendations

- Replace SQLite with Postgres or MySQL.
- Move JWT secrets to environment variables managed by the platform.
- Serve the built frontend static assets from Nginx.
- Use secure cookie-based auth rather than localStorage for production.

---

## 7. Database schema

### 7.1 Table definitions

#### `users`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `name` TEXT NOT NULL
- `email` TEXT NOT NULL UNIQUE COLLATE NOCASE
- `password_hash` TEXT NOT NULL
- `is_active` INTEGER NOT NULL DEFAULT 1
- `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` TEXT

#### `profiles`
- `user_id` INTEGER PRIMARY KEY
- `currency` TEXT NOT NULL DEFAULT 'USD'
- `bio` TEXT
- `avatar` TEXT
- `phone` TEXT
- `timezone` TEXT
- `language` TEXT
- `FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE`

#### `friendships`
- `user_low_id` INTEGER NOT NULL
- `user_high_id` INTEGER NOT NULL
- `created_by` INTEGER NOT NULL
- `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- PRIMARY KEY (`user_low_id`, `user_high_id`)
- CHECK (`user_low_id` < `user_high_id`)

#### `friend_invites`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `invited_by` INTEGER NOT NULL
- `email` TEXT NOT NULL COLLATE NOCASE
- `status` TEXT NOT NULL DEFAULT 'pending'
- `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- UNIQUE(`invited_by`, `email`)

#### `groups`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `name` TEXT NOT NULL
- `type` TEXT NOT NULL DEFAULT 'other'
- `currency` TEXT NOT NULL DEFAULT 'USD'
- `notes` TEXT
- `simplify_debts` INTEGER NOT NULL DEFAULT 1
- `created_by` INTEGER NOT NULL
- `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` TEXT

#### `group_members`
- `group_id` INTEGER NOT NULL
- `user_id` INTEGER NOT NULL
- `role` TEXT NOT NULL DEFAULT 'member'
- `joined_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- PRIMARY KEY(`group_id`, `user_id`)

#### `group_invites`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `group_id` INTEGER NOT NULL
- `invited_by` INTEGER NOT NULL
- `email` TEXT NOT NULL COLLATE NOCASE
- `status` TEXT NOT NULL DEFAULT 'pending'
- `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- UNIQUE(`group_id`, `email`)

#### `expenses`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `group_id` INTEGER NOT NULL
- `description` TEXT NOT NULL
- `amount_cents` INTEGER NOT NULL CHECK (`amount_cents` > 0)
- `currency` TEXT NOT NULL DEFAULT 'USD'
- `paid_by_user_id` INTEGER NOT NULL
- `split_type` TEXT NOT NULL CHECK (`split_type` IN ('equal', 'exact', 'percentage', 'shares'))
- `expense_date` TEXT NOT NULL
- `notes` TEXT
- `created_by` INTEGER NOT NULL
- `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` TEXT

#### `expense_splits`
- `expense_id` INTEGER NOT NULL
- `user_id` INTEGER NOT NULL
- `amount_cents` INTEGER NOT NULL CHECK (`amount_cents` >= 0)
- `input_value` REAL
- PRIMARY KEY(`expense_id`, `user_id`)

#### `payments`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `group_id` INTEGER NOT NULL
- `from_user_id` INTEGER NOT NULL
- `to_user_id` INTEGER NOT NULL
- `amount_cents` INTEGER NOT NULL CHECK (`amount_cents` > 0)
- `currency` TEXT NOT NULL DEFAULT 'USD'
- `note` TEXT
- `paid_at` TEXT NOT NULL
- `created_by` INTEGER NOT NULL
- `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- CHECK (`from_user_id` <> `to_user_id`)

#### `expense_comments`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `expense_id` INTEGER NOT NULL
- `user_id` INTEGER NOT NULL
- `message` TEXT NOT NULL
- `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

#### `activities`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `actor_user_id` INTEGER NOT NULL
- `group_id` INTEGER
- `expense_id` INTEGER
- `payment_id` INTEGER
- `action` TEXT NOT NULL
- `metadata` TEXT
- `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

### 7.2 Schema migration notes

- `SW_backend/db.js` checks `PRAGMA table_info('profiles')` and adds `avatar`, `phone`, `timezone`, `language` if missing.
- `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` are enabled.
- Indices include group member lookup, expense group/date, expense comments, and activities.

---

## 8. Backend implementation details

### 8.1 `SW_backend/index.js`

- Imports `dotenv/config` for environment vars.
- Opens the SQLite DB with `getDb()`.
- Creates the Express app with `createApp({ db })`.
- Listens on `process.env.PORT || 4000`.

### 8.2 `SW_backend/app.js`

- Imports Express, cors, bcryptjs, auth helpers, ledger helpers, and realtime hub.
- Defines utility functions: `normalizeEmail`, `cleanText`, `parseMetadata`, `withTransaction`, `addActivity`, `getMembership`, `requireMembership`, `requireGroupManager`, `getGroupBalances`, and `getAccessibleExpense`.
- Uses `cors` with `origin` derived from `process.env.CORS_ORIGIN`.
- Uses `express.json({ limit: '2mb' })`.
- Exposes all backend routes under `/api`.

### 8.3 `SW_backend/auth.js`

- `createToken(user, secret)` signs JWT with payload `{ id, email, name }` and 7d expiry.
- `readToken(token, secret)` verifies JWT.
- `requireAuth(secret)` middleware extracts `Authorization` header, verifies token, and attaches `req.user`.

### 8.4 `SW_backend/ledger.js`

- `toCents(value)` converts decimal values to integer cents.
- `allocateByWeights(totalCents, entries)` distributes cents proportionally.
- `calculateSplits({ totalCents, splitType, participantIds, splitValues })` supports `equal`, `exact`, `percentage`, `shares`.
- `simplifyBalances(balanceRows)` computes a greedy set of suggested payments.

### 8.5 `SW_backend/realtime.js`

- In-memory SSE hub.
- `createRealtimeHub()` exposes `subscribe(channel, response)` and `publish(channel, event, data)`.
- Used by expense comment endpoints for live updates.

---

## 9. Frontend implementation details

### 9.1 `SW_frontend/src/main.jsx`

- Renders the React root into `document.getElementById('root')`.
- Wraps `<App />` with `BrowserRouter`.

### 9.2 `SW_frontend/src/App.jsx`

- Defines public and protected routes.
- `ProtectedWorkspace()` checks for `localStorage.sw_token`.
- Routes:
  - `/`
  - `/login`
  - `/signup`
  - `/app`
  - `/app/activity`
  - `/app/expenses`
  - `/app/groups/:groupId`
  - `/account` and `/accountinfoform` redirect to `/app`.

### 9.3 `SW_frontend/src/lib/api.js`

- Resolves `API_ROOT` from `import.meta.env.VITE_API_URL`.
- `api(path, options)` performs fetch with JSON headers and optional auth.
- Parses JSON and throws errors for non-ok responses.
- `expenseStreamUrl(expenseId)` builds SSE URL with token query.

### 9.4 Authentication UI

- `Login.jsx` and `Signup.jsx` use controlled inputs.
- Both post to backend endpoints and store JWT on success.
- Login includes a reminder link for forgot password (UI only).

### 9.5 Authenticated app shell

- `Workspace.jsx` is the main authenticated app shell.
- It loads bootstrap data, group data, and expenses.
- It renders sidebar navigation, groups, friends, invite card, and right-hand summaries.
- It opens modals for create group, add expense, settle up, and group settings.
- It uses `api()` helper for all backend requests.

### 9.6 Modal components

- `CreateGroupModal.jsx`: group creation and email invites.
- `ExpenseModal.jsx`: expense creation with split type controls.
- `ExpenseDetailModal.jsx`: expense detail view, comment feed, delete expense.
- `GroupSettingsModal.jsx`: edit group settings, invite members, remove members, delete group.
- `SettlementModal.jsx`: record a payment between two members.
- `Modal.jsx`: generic accessible modal wrapper.

### 9.7 UI helpers

- `formatMoney` and `formatDate` standardize display.
- `initials` computes avatar initials from a user name.

---

## 10. API design and example payloads

### 10.1 Signup

**Request**
```json
{ "name": "Alice", "email": "alice@example.com", "password": "secret123" }
```

**Response**
```json
{ "user": { "id": 1, "name": "Alice", "email": "alice@example.com" }, "token": "..." }
```

### 10.2 Login

**Request**
```json
{ "email": "alice@example.com", "password": "secret123" }
```

**Response**
```json
{ "user": { "id": 1, "name": "Alice", "email": "alice@example.com" }, "token": "..." }
```

### 10.3 Create group

**Request**
```json
{ "name": "Weekend Trip", "type": "trip", "memberEmails": ["bob@example.com"] }
```

### 10.4 Create expense

**Request**
```json
{
  "groupId": 2,
  "description": "Dinner with team",
  "amount": 120.50,
  "paidByUserId": 10,
  "participantIds": [10, 11],
  "splitType": "equal"
}
```

### 10.5 Settle payment

**Request**
```json
{
  "groupId": 2,
  "fromUserId": 11,
  "toUserId": 10,
  "amount": 60.25,
  "note": "Cash back",
  "paidAt": "2026-06-07"
}
```

---

## 11. Core algorithms

### 11.1 Money conversion

- `toCents(value)` converts decimal values to integer cents.
- It uses `Number.isFinite(number)` and `Math.round((number + Number.EPSILON) * 100)`.

### 11.2 Split allocation

- `allocateByWeights(totalCents, entries)` distributes cents proportionally.
- It floors each allocation, computes fractional remainders, and assigns leftover cents to the highest remainder entries.

### 11.3 Split modes

- `equal`: each participant gets equal weight.
- `exact`: exact numeric amounts are validated to equal the total.
- `percentage`: values must sum to 100, then allocation is weight-based.
- `shares`: values are treated as relative shares.

### 11.4 Balance simplification

- `simplifyBalances(balanceRows)` sorts creditors and debtors.
- It greedily matches the largest creditor with the largest debtor.
- The output is a list of suggested transfers.

---

## 12. Known limitations and trade-offs

- Uses JWT in `localStorage` for simplicity, not production safety.
- Stores avatars as base64 text in SQLite.
- Backend validation is MVP-level and primarily trusts frontend inputs.
- No rate limiting, CSRF protection, or hardened production middleware.
- Uses SQLite, which is fine for local dev but not for scale.

---

## 13. Build and run instructions

### Frontend

```bash
cd SW_frontend
npm install
npm run dev
```

### Backend

```bash
cd SW_backend
npm install
npm run dev
```

### Lint and build

```bash
cd SW_frontend
npm run lint
npm run build

cd SW_backend
npm test
```

---

## 14. Docker setup

- `docker-compose.yml` runs backend, frontend, and a persisted `sw_data` volume.
- Backend environment in compose:
  - `PORT=4000`
  - `DB_PATH=/data/sw.db`
  - `JWT_SECRET=${JWT_SECRET:-local-docker-secret-change-before-production}`
  - `CORS_ORIGIN=http://localhost:8088`
- Host mapping:
  - Backend `4001:4000`
  - Frontend `8088:80`

### Use

```bash
cp .env.example .env
docker compose up --build
```

---

## 15. Prompts and AI Q&A history

The raw prompt transcript is available at:

`/Users/prathamvithalchoudhari/Library/Application Support/Code/User/workspaceStorage/d400bbfac7f711acda8f3dd34d6b83db/GitHub.copilot-chat/transcripts/c1b9f213-8cc5-426c-8221-f13762b59b03.jsonl`

Highlights:
- UI first: login, signup, routing.
- Backend integration: signup/login/auth, profile, JWT.
- Group & expense flows: membership checks, split calculations, suggested debts.
- Debugging: backend startup path, port mismatch, missing signup name.

---

## 16. Changes made during implementation

- Built the React + Vite frontend and the Express backend.
- Added auth flows and JWT-based protected routes.
- Implemented profile editing and password changes.
- Created group management and invite member flows.
- Added expense creation, split types, and settlement records.
- Added SSE-based expense comments.
- Added Docker compose and environment configuration.

---

## 17. Manual E2E validation trace

This trace was executed against a backend running at `http://localhost:5100/api`.

1. `POST /api/signup` user1 → 201 Created.
2. `POST /api/signup` user2 → 201 Created.
3. `POST /api/login` user1 → 200 OK.
4. `POST /api/groups` create group → 201 Created.
5. `GET /api/groups/:groupId` → 200 OK, correct members and initial balances.
6. `POST /api/expenses` add equal expense → 201 Created.
7. `GET /api/groups/:groupId` after expense → balances updated, debt suggested.
8. `GET /api/bootstrap` → dashboard state includes user, groups, and activity.

---

## 18. Repo file map

- `/SW_frontend`
  - `package.json`
  - `.env`
  - `src/main.jsx`
  - `src/App.jsx`
  - `src/lib/api.js`
  - `src/components/Login.jsx`
  - `src/components/Signup.jsx`
  - `src/components/Navbar.jsx`
  - `src/components/Footer.jsx`
  - `src/components/app/Workspace.jsx`
  - `src/components/app/ExpenseModal.jsx`
  - `src/components/app/ExpenseDetailModal.jsx`
  - `src/components/app/CreateGroupModal.jsx`
  - `src/components/app/GroupSettingsModal.jsx`
  - `src/components/app/SettlementModal.jsx`
  - `src/components/app/Modal.jsx`

- `/SW_backend`
  - `package.json`
  - `.env`
  - `index.js`
  - `app.js`
  - `db.js`
  - `auth.js`
  - `ledger.js`
  - `realtime.js`
  - `sw.db`

- `/docker-compose.yml`
- `/.env.example`
- `/README.md`
- `/ARCHITECTURE.md`

---

## 19. Rebuild checklist for another engineer or AI

1. Read this file thoroughly to understand scope and architecture.
2. Install Node dependencies in both `SW_frontend` and `SW_backend`.
3. Configure `.env` files.
4. Start backend and confirm `GET /api/health` responds.
5. Start frontend and navigate to the app.
6. Test signup/login, group creation, expense creation, and balance display.

---

## 20. Known limitations

- No production-safe auth storage.
- No file storage for avatars.
- Minimal backend validation outside the core expense flow.
- No production-grade logging or monitoring.
- SSE is in-memory and not clustered.
- No automated frontend tests included.

---

## 21. Current active issues

- Ensure `SW_frontend/.env` port matches backend `PORT`.
- Verify the backend health endpoint resolves at the expected host/port.
- Confirm user signup includes `name` and the frontend sends it.

---

End of AI_CONTEXT.md
