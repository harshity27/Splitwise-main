import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.js';
import { getDb } from './db.js';

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data };
}

test('complete group expense and settlement workflow', async (context) => {
  const db = await getDb({ filename: ':memory:' });
  const app = createApp({
    db,
    jwtSecret: 'test-secret',
    corsOrigin: 'http://localhost:5173',
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });

  const aliceSignup = await request(baseUrl, '/api/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
    }),
  });
  assert.equal(aliceSignup.response.status, 201);

  const bobSignup = await request(baseUrl, '/api/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'password123',
    }),
  });
  assert.equal(bobSignup.response.status, 201);

  const authHeaders = { Authorization: `Bearer ${aliceSignup.data.token}` };
  const groupResult = await request(baseUrl, '/api/groups', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Test trip',
      type: 'trip',
      memberEmails: ['bob@example.com'],
    }),
  });
  assert.equal(groupResult.response.status, 201);
  const groupId = groupResult.data.group.id;

  const group = await request(baseUrl, `/api/groups/${groupId}`, { headers: authHeaders });
  assert.equal(group.data.members.length, 2);
  const alice = group.data.members.find((member) => member.email === 'alice@example.com');
  const bob = group.data.members.find((member) => member.email === 'bob@example.com');

  const expenseResult = await request(baseUrl, '/api/expenses', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      groupId,
      description: 'Cab',
      amount: '100.00',
      paidByUserId: alice.id,
      participantIds: [alice.id, bob.id],
      splitType: 'exact',
      splitValues: { [alice.id]: 40, [bob.id]: 60 },
      expenseDate: '2026-06-06',
    }),
  });
  assert.equal(expenseResult.response.status, 201);

  const balances = await request(baseUrl, `/api/groups/${groupId}/balances`, {
    headers: authHeaders,
  });
  assert.deepEqual(
    balances.data.balances.map((balance) => [balance.name, balance.netCents]),
    [['Alice', 6000], ['Bob', -6000]],
  );

  const comment = await request(
    baseUrl,
    `/api/expenses/${expenseResult.data.expense.id}/comments`,
    {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ message: 'Receipt checked.' }),
    },
  );
  assert.equal(comment.response.status, 201);
  assert.equal(comment.data.comment.message, 'Receipt checked.');

  const payment = await request(baseUrl, '/api/payments', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      groupId,
      fromUserId: bob.id,
      toUserId: alice.id,
      amount: '60.00',
      paidAt: '2026-06-06',
    }),
  });
  assert.equal(payment.response.status, 201);

  const settledBalances = await request(baseUrl, `/api/groups/${groupId}/balances`, {
    headers: authHeaders,
  });
  assert.ok(settledBalances.data.balances.every((balance) => balance.netCents === 0));
  assert.deepEqual(settledBalances.data.debts, []);
});
