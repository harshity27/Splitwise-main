# Shared expense MVP

A full-stack Splitwise-style application with a React frontend, Express API,
relational SQLite database, realtime expense chat, and Docker packaging.
Codex AI is used

## Included

- Signup, login, JWT sessions, profile API, and password changes.
- Group creation, editing, invitations, member addition, and safe removal.
- Equal, exact, percentage, and share-based expense splits.
- Group balances, personal summaries, suggested debts, and activity history.
- Cash/payment settlement recording.
- Expense-level realtime chat using Server-Sent Events.
- Responsive desktop and mobile layouts based on the supplied references.
- Transactional relational schema and persistent Docker volume.

## Run with Docker

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:8088](http://localhost:8088). The API is also available
directly at [http://localhost:4001/api/health](http://localhost:4001/api/health).

Data persists in the `sw_data` Docker volume. To stop the app:

```bash
docker compose down
```

## Run locally

Terminal 1:

```bash
cd SW_backend
npm install
npm run dev
```

Terminal 2:

```bash
cd SW_frontend
npm install
npm run dev
```

With the checked-in development environment files, the backend runs on port
`5000` and the frontend on port `5174`.

## Verify

```bash
cd SW_backend && npm test
cd ../SW_frontend && npm run lint && npm run build
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the schema and balance rules.
