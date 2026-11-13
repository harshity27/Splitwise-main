# Architecture

## Runtime

- React 19 and Vite render the browser application.
- Express provides the JSON API and Server-Sent Events stream.
- SQLite stores all application data in normalized relational tables.
- Nginx serves the production frontend and proxies `/api` to Express.
- Docker Compose runs both services and persists the database in `sw_data`.

## Data model

- `users`, `profiles`: authentication and user preferences.
- `friendships`, `friend_invites`: friend relationships and pending invitations.
- `groups`, `group_members`, `group_invites`: group ownership and membership.
- `expenses`, `expense_splits`: expense headers and per-user shares.
- `payments`: recorded settlements between two group members.
- `expense_comments`: expense-level chat messages.
- `activities`: group and expense audit feed.

Money is stored as integer cents. Expense creation and updates run inside a
database transaction, and the API rejects any split that does not reconcile to
the expense total.

## Balance calculation

For each expense:

1. Credit the payer with the full expense amount.
2. Debit every participant by their calculated share.
3. Apply settlements by crediting the sender and debiting the recipient.
4. Match debtors and creditors to produce a minimal suggested payment list.

Equal, exact, percentage, and share splits all use deterministic remainder
allocation, so the stored split always adds up to the original amount.

## Realtime comments

Clients load existing comments through the expense detail endpoint and subscribe
to `/api/expenses/:id/comments/stream`. New comments are persisted first and
then published to authorized listeners through Server-Sent Events.
