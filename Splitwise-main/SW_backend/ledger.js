export function toCents(value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error('Amount must be a valid number.');
  return Math.round((number + Number.EPSILON) * 100);
}

function allocateByWeights(totalCents, entries) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) throw new Error('Split values must be greater than zero.');

  const allocated = entries.map((entry, index) => {
    const raw = (totalCents * entry.weight) / totalWeight;
    const amountCents = Math.floor(raw);
    return { ...entry, index, amountCents, fraction: raw - amountCents };
  });

  let remainder = totalCents - allocated.reduce((sum, entry) => sum + entry.amountCents, 0);
  allocated
    .slice()
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach((entry) => {
      if (remainder > 0) {
        allocated[entry.index].amountCents += 1;
        remainder -= 1;
      }
    });

  return allocated.map(({ userId, inputValue, amountCents }) => ({
    userId,
    inputValue,
    amountCents,
  }));
}

export function calculateSplits({ totalCents, splitType, participantIds, splitValues = {} }) {
  const userIds = [...new Set(participantIds.map(Number))];
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }
  if (!userIds.length || userIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Choose at least one valid participant.');
  }

  if (splitType === 'equal') {
    return allocateByWeights(
      totalCents,
      userIds.map((userId) => ({ userId, weight: 1, inputValue: 1 })),
    );
  }

  if (splitType === 'exact') {
    const splits = userIds.map((userId) => {
      const amountCents = toCents(splitValues[userId]);
      if (amountCents < 0) throw new Error('Exact split amounts cannot be negative.');
      return { userId, amountCents, inputValue: Number(splitValues[userId]) };
    });
    const total = splits.reduce((sum, split) => sum + split.amountCents, 0);
    if (total !== totalCents) throw new Error('Exact split amounts must equal the expense total.');
    return splits;
  }

  if (splitType === 'percentage') {
    const entries = userIds.map((userId) => {
      const percentage = Number(splitValues[userId]);
      if (!Number.isFinite(percentage) || percentage < 0) {
        throw new Error('Percentages must be zero or greater.');
      }
      return { userId, weight: percentage, inputValue: percentage };
    });
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (Math.abs(total - 100) > 0.001) throw new Error('Percentages must add up to 100.');
    return allocateByWeights(totalCents, entries);
  }

  if (splitType === 'shares') {
    const entries = userIds.map((userId) => {
      const shares = Number(splitValues[userId]);
      if (!Number.isFinite(shares) || shares < 0) {
        throw new Error('Shares must be zero or greater.');
      }
      return { userId, weight: shares, inputValue: shares };
    });
    return allocateByWeights(totalCents, entries);
  }

  throw new Error('Unsupported split type.');
}

export function simplifyBalances(balanceRows) {
  const creditors = balanceRows
    .filter((row) => row.netCents > 0)
    .map((row) => ({ ...row }))
    .sort((a, b) => b.netCents - a.netCents);
  const debtors = balanceRows
    .filter((row) => row.netCents < 0)
    .map((row) => ({ ...row, owedCents: -row.netCents }))
    .sort((a, b) => b.owedCents - a.owedCents);

  const debts = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amountCents = Math.min(creditor.netCents, debtor.owedCents);

    if (amountCents > 0) {
      debts.push({
        fromUserId: debtor.userId,
        fromName: debtor.name,
        toUserId: creditor.userId,
        toName: creditor.name,
        amountCents,
      });
    }

    creditor.netCents -= amountCents;
    debtor.owedCents -= amountCents;
    if (creditor.netCents === 0) creditorIndex += 1;
    if (debtor.owedCents === 0) debtorIndex += 1;
  }

  return debts;
}
