# Splitwise-style backend

Express and SQLite API for authentication, groups, expenses, balances,
settlements, activity, and realtime expense comments.

## Development

```bash
npm install
npm run dev
```

The existing `.env` runs the API at `http://localhost:5000`.

## Verification

```bash
npm test
```

The test suite covers all split modes and a complete two-user expense and
settlement workflow.
