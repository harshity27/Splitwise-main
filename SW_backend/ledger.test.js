import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSplits, simplifyBalances, toCents } from './ledger.js';

test('converts currency values to integer cents', () => {
  assert.equal(toCents('12.34'), 1234);
  assert.equal(toCents(0.1 + 0.2), 30);
});

test('equal splits distribute remainder deterministically', () => {
  const result = calculateSplits({
    totalCents: 1000,
    splitType: 'equal',
    participantIds: [1, 2, 3],
  });
  assert.deepEqual(result.map((split) => split.amountCents), [334, 333, 333]);
});

test('percentage and share splits reconcile exactly', () => {
  const percentage = calculateSplits({
    totalCents: 999,
    splitType: 'percentage',
    participantIds: [1, 2],
    splitValues: { 1: 60, 2: 40 },
  });
  assert.equal(percentage.reduce((sum, split) => sum + split.amountCents, 0), 999);

  const shares = calculateSplits({
    totalCents: 1000,
    splitType: 'shares',
    participantIds: [1, 2, 3],
    splitValues: { 1: 1, 2: 2, 3: 1 },
  });
  assert.deepEqual(shares.map((split) => split.amountCents), [250, 500, 250]);
});

test('exact splits must equal the expense total', () => {
  assert.throws(() => calculateSplits({
    totalCents: 1000,
    splitType: 'exact',
    participantIds: [1, 2],
    splitValues: { 1: 3, 2: 6 },
  }), /must equal/);
});

test('simplifies balances into payable debts', () => {
  const debts = simplifyBalances([
    { userId: 1, name: 'A', netCents: -700 },
    { userId: 2, name: 'B', netCents: 500 },
    { userId: 3, name: 'C', netCents: 200 },
  ]);
  assert.deepEqual(debts, [
    { fromUserId: 1, fromName: 'A', toUserId: 2, toName: 'B', amountCents: 500 },
    { fromUserId: 1, fromName: 'A', toUserId: 3, toName: 'C', amountCents: 200 },
  ]);
});
