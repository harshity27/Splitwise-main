import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { createToken, readToken, requireAuth } from './auth.js';
import { calculateSplits, simplifyBalances, toCents } from './ledger.js';
import { createRealtimeHub } from './realtime.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function cleanText(value) {
  return String(value || '').trim();
}

function parseMetadata(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

async function withTransaction(db, callback) {
  await db.exec('BEGIN IMMEDIATE');
  try {
    const result = await callback();
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

async function addActivity(db, {
  actorUserId,
  groupId = null,
  expenseId = null,
  paymentId = null,
  action,
  metadata = {},
}) {
  await db.run(
    `INSERT INTO activities
      (actor_user_id, group_id, expense_id, payment_id, action, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    actorUserId,
    groupId,
    expenseId,
    paymentId,
    action,
    JSON.stringify(metadata),
  );
}

async function getMembership(db, groupId, userId) {
  return db.get(
    `SELECT gm.role, g.name, g.currency, g.created_by, g.type, g.notes, g.simplify_debts
     FROM group_members gm
     JOIN groups g ON g.id = gm.group_id
     WHERE gm.group_id = ? AND gm.user_id = ?`,
    groupId,
    userId,
  );
}

async function requireMembership(db, groupId, userId) {
  const membership = await getMembership(db, groupId, userId);
  if (!membership) {
    const error = new Error('You are not a member of this group.');
    error.status = 403;
    throw error;
  }
  return membership;
}

async function requireGroupManager(db, groupId, userId) {
  const membership = await requireMembership(db, groupId, userId);
  if (!['owner', 'admin'].includes(membership.role)) {
    const error = new Error('Only a group owner or admin can do that.');
    error.status = 403;
    throw error;
  }
  return membership;
}

async function getGroupBalances(db, groupId) {
  const members = await db.all(
    `SELECT u.id AS user_id, u.name, u.email
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ?
     ORDER BY u.name`,
    groupId,
  );

  const netByUser = new Map(members.map((member) => [member.user_id, 0]));
  const expenses = await db.all(
    `SELECT e.id, e.paid_by_user_id, e.amount_cents, es.user_id, es.amount_cents AS share_cents
     FROM expenses e
     JOIN expense_splits es ON es.expense_id = e.id
     WHERE e.group_id = ?`,
    groupId,
  );

  const creditedExpenses = new Set();
  for (const row of expenses) {
    if (!creditedExpenses.has(row.id)) {
      netByUser.set(
        row.paid_by_user_id,
        (netByUser.get(row.paid_by_user_id) || 0) + row.amount_cents,
      );
      creditedExpenses.add(row.id);
    }
    netByUser.set(row.user_id, (netByUser.get(row.user_id) || 0) - row.share_cents);
  }

  const payments = await db.all(
    'SELECT from_user_id, to_user_id, amount_cents FROM payments WHERE group_id = ?',
    groupId,
  );
  for (const payment of payments) {
    netByUser.set(
      payment.from_user_id,
      (netByUser.get(payment.from_user_id) || 0) + payment.amount_cents,
    );
    netByUser.set(
      payment.to_user_id,
      (netByUser.get(payment.to_user_id) || 0) - payment.amount_cents,
    );
  }

  const balances = members.map((member) => ({
    userId: member.user_id,
    name: member.name,
    email: member.email,
    netCents: netByUser.get(member.user_id) || 0,
  }));

  return { balances, debts: simplifyBalances(balances) };
}

async function getAccessibleExpense(db, expenseId, userId) {
  return db.get(
    `SELECT e.*, g.name AS group_name, payer.name AS paid_by_name
     FROM expenses e
     JOIN groups g ON g.id = e.group_id
     JOIN users payer ON payer.id = e.paid_by_user_id
     JOIN group_members gm ON gm.group_id = e.group_id
     WHERE e.id = ? AND gm.user_id = ?`,
    expenseId,
    userId,
  );
}

async function addKnownUserOrInvite(db, { groupId, invitedBy, email }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { kind: 'ignored' };

  const user = await db.get('SELECT id, name, email FROM users WHERE email = ?', normalizedEmail);
  if (user) {
    await db.run(
      `INSERT OR IGNORE INTO group_members (group_id, user_id, role)
       VALUES (?, ?, 'member')`,
      groupId,
      user.id,
    );
    await db.run(
      `UPDATE group_invites SET status = 'accepted'
       WHERE group_id = ? AND email = ?`,
      groupId,
      normalizedEmail,
    );
    return { kind: 'member', user };
  }

  await db.run(
    `INSERT INTO group_invites (group_id, invited_by, email)
     VALUES (?, ?, ?)
     ON CONFLICT(group_id, email) DO UPDATE SET
       status = 'pending',
       invited_by = excluded.invited_by`,
    groupId,
    invitedBy,
    normalizedEmail,
  );
  return { kind: 'invite', email: normalizedEmail };
}

async function acceptPendingInvites(db, user) {
  const invites = await db.all(
    `SELECT id, group_id FROM group_invites
     WHERE email = ? AND status = 'pending'`,
    user.email,
  );

  for (const invite of invites) {
    await db.run(
      `INSERT OR IGNORE INTO group_members (group_id, user_id, role)
       VALUES (?, ?, 'member')`,
      invite.group_id,
      user.id,
    );
    await db.run("UPDATE group_invites SET status = 'accepted' WHERE id = ?", invite.id);
  }

  const friendInvites = await db.all(
    `SELECT id, invited_by FROM friend_invites
     WHERE email = ? AND status = 'pending'`,
    user.email,
  );
  for (const invite of friendInvites) {
    const low = Math.min(invite.invited_by, user.id);
    const high = Math.max(invite.invited_by, user.id);
    if (low !== high) {
      await db.run(
        `INSERT OR IGNORE INTO friendships (user_low_id, user_high_id, created_by)
         VALUES (?, ?, ?)`,
        low,
        high,
        invite.invited_by,
      );
    }
    await db.run("UPDATE friend_invites SET status = 'accepted' WHERE id = ?", invite.id);
  }
}

export function createApp({
  db,
  jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me',
  corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173',
} = {}) {
  if (!db) throw new Error('A database connection is required.');

  const app = express();
  const auth = requireAuth(jwtSecret);
  const realtime = createRealtimeHub();

  app.use(cors({
    origin(origin, callback) {
      const allowed = corsOrigin.split(',').map((item) => item.trim());
      if (!origin || allowed.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS.'));
    },
  }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', async (_req, res) => {
    await db.get('SELECT 1');
    res.json({ status: 'ok', database: 'sqlite' });
  });

  const signup = async (req, res) => {
    const name = cleanText(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    try {
      const result = await withTransaction(db, async () => {
        const passwordHash = bcrypt.hashSync(password, 10);
        const inserted = await db.run(
          'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
          name,
          email,
          passwordHash,
        );
        const user = { id: inserted.lastID, name, email };
        await db.run('INSERT INTO profiles (user_id) VALUES (?)', user.id);
        await acceptPendingInvites(db, user);
        return user;
      });
      return res.status(201).json({ user: result, token: createToken(result, jwtSecret) });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        return res.status(409).json({ message: 'An account with that email already exists.' });
      }
      throw error;
    }
  };

  const login = async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await db.get(
      'SELECT id, name, email, password_hash FROM users WHERE email = ? AND is_active = 1',
      email,
    );
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    return res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token: createToken(user, jwtSecret),
    });
  };

  app.post(['/api/signup', '/api/auth/signup'], signup);
  app.post(['/api/login', '/api/auth/login'], login);

  app.get('/api/profile', auth, async (req, res) => {
    const user = await db.get(
      `SELECT u.id, u.name, u.email, u.created_at,
              p.currency, p.bio, p.avatar, p.phone, p.timezone, p.language
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
      req.user.id,
    );
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
        profile: {
          currency: user.currency || 'USD',
          bio: user.bio,
          avatar: user.avatar,
          phone: user.phone,
          timezone: user.timezone,
          language: user.language,
        },
      },
    });
  });

  app.put('/api/profile', auth, async (req, res) => {
    const name = cleanText(req.body?.name);
    const profile = {
      currency: cleanText(req.body?.currency) || 'USD',
      bio: cleanText(req.body?.bio) || null,
      avatar: cleanText(req.body?.avatar) || null,
      phone: cleanText(req.body?.phone) || null,
      timezone: cleanText(req.body?.timezone) || null,
      language: cleanText(req.body?.language) || null,
    };

    await withTransaction(db, async () => {
      if (name) {
        await db.run(
          'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          name,
          req.user.id,
        );
      }
      await db.run(
        `INSERT INTO profiles (user_id, currency, bio, avatar, phone, timezone, language)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           currency = excluded.currency,
           bio = excluded.bio,
           avatar = excluded.avatar,
           phone = excluded.phone,
           timezone = excluded.timezone,
           language = excluded.language`,
        req.user.id,
        profile.currency,
        profile.bio,
        profile.avatar,
        profile.phone,
        profile.timezone,
        profile.language,
      );
    });

    const updatedUser = await db.get('SELECT id, name, email FROM users WHERE id = ?', req.user.id);
    return res.json({ user: { ...updatedUser, profile } });
  });
app.get("/", (req, res) => {
  res.send("Splitwise Backend Running 🚀");
});
  app.post('/api/change-password', auth, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || newPassword.length < 8) {
      return res.status(400).json({
        message: 'Current password and a new password of at least 8 characters are required.',
      });
    }
    const user = await db.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    await db.run(
      `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      bcrypt.hashSync(newPassword, 10),
      req.user.id,
    );
    return res.json({ message: 'Password changed.' });
  });

  app.get('/api/bootstrap', auth, async (req, res) => {
    const user = await db.get('SELECT id, name, email FROM users WHERE id = ?', req.user.id);
    const groups = await db.all(
      `SELECT g.id, g.name, g.type, g.currency, g.notes, g.simplify_debts,
              gm.role, COUNT(all_members.user_id) AS member_count
       FROM group_members gm
       JOIN groups g ON g.id = gm.group_id
       LEFT JOIN group_members all_members ON all_members.group_id = g.id
       WHERE gm.user_id = ?
       GROUP BY g.id
       ORDER BY LOWER(g.name)`,
      req.user.id,
    );

    let totalBalanceCents = 0;
    const groupSummaries = [];
    for (const group of groups) {
      const ledger = await getGroupBalances(db, group.id);
      const current = ledger.balances.find((balance) => balance.userId === req.user.id);
      totalBalanceCents += current?.netCents || 0;
      groupSummaries.push({
        ...group,
        memberCount: group.member_count,
        netCents: current?.netCents || 0,
      });
    }

    const friends = await db.all(
      `SELECT u.id, u.name, u.email
       FROM friendships f
       JOIN users u ON u.id = CASE
         WHEN f.user_low_id = ? THEN f.user_high_id
         ELSE f.user_low_id
       END
       WHERE f.user_low_id = ? OR f.user_high_id = ?
       ORDER BY LOWER(u.name)`,
      req.user.id,
      req.user.id,
      req.user.id,
    );

    const activity = await db.all(
      `SELECT a.*, u.name AS actor_name, g.name AS group_name
       FROM activities a
       JOIN users u ON u.id = a.actor_user_id
       LEFT JOIN groups g ON g.id = a.group_id
       WHERE a.actor_user_id = ?
          OR a.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 30`,
      req.user.id,
      req.user.id,
    );

    return res.json({
      user,
      groups: groupSummaries,
      friends,
      totalBalanceCents,
      activity: activity.map((item) => ({ ...item, metadata: parseMetadata(item.metadata) })),
    });
  });

  app.post('/api/friends/invite', auth, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email || email === normalizeEmail(req.user.email)) {
      return res.status(400).json({ message: 'Enter another person\'s email address.' });
    }

    const friend = await db.get('SELECT id, name, email FROM users WHERE email = ?', email);
    if (friend) {
      const low = Math.min(friend.id, req.user.id);
      const high = Math.max(friend.id, req.user.id);
      await db.run(
        `INSERT OR IGNORE INTO friendships (user_low_id, user_high_id, created_by)
         VALUES (?, ?, ?)`,
        low,
        high,
        req.user.id,
      );
      return res.status(201).json({ status: 'added', friend });
    }

    await db.run(
      `INSERT INTO friend_invites (invited_by, email)
       VALUES (?, ?)
       ON CONFLICT(invited_by, email) DO UPDATE SET status = 'pending'`,
      req.user.id,
      email,
    );
    return res.status(201).json({ status: 'invited', email });
  });

  app.post('/api/groups', auth, async (req, res) => {
    const name = cleanText(req.body?.name);
    const type = ['home', 'trip', 'couple', 'other'].includes(req.body?.type)
      ? req.body.type
      : 'other';
    const memberEmails = Array.isArray(req.body?.memberEmails) ? req.body.memberEmails : [];
    if (!name) return res.status(400).json({ message: 'Group name is required.' });

    const groupId = await withTransaction(db, async () => {
      const inserted = await db.run(
        `INSERT INTO groups (name, type, currency, created_by)
         VALUES (?, ?, ?, ?)`,
        name,
        type,
        cleanText(req.body?.currency) || 'USD',
        req.user.id,
      );
      await db.run(
        `INSERT INTO group_members (group_id, user_id, role)
         VALUES (?, ?, 'owner')`,
        inserted.lastID,
        req.user.id,
      );
      for (const email of memberEmails) {
        await addKnownUserOrInvite(db, {
          groupId: inserted.lastID,
          invitedBy: req.user.id,
          email,
        });
      }
      await addActivity(db, {
        actorUserId: req.user.id,
        groupId: inserted.lastID,
        action: 'group.created',
        metadata: { groupName: name },
      });
      return inserted.lastID;
    });

    const group = await db.get('SELECT * FROM groups WHERE id = ?', groupId);
    return res.status(201).json({ group });
  });

  app.get('/api/groups/:groupId', auth, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const membership = await requireMembership(db, groupId, req.user.id);
    const group = await db.get('SELECT * FROM groups WHERE id = ?', groupId);
    const members = await db.all(
      `SELECT u.id, u.name, u.email, gm.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, LOWER(u.name)`,
      groupId,
    );
    const invites = await db.all(
      `SELECT id, email, status, created_at
       FROM group_invites
       WHERE group_id = ? AND status = 'pending'
       ORDER BY created_at DESC`,
      groupId,
    );
    const expenses = await db.all(
      `SELECT e.*, payer.name AS paid_by_name,
              COUNT(es.user_id) AS participant_count,
              COALESCE((SELECT COUNT(*) FROM expense_comments c WHERE c.expense_id = e.id), 0) AS comment_count
       FROM expenses e
       JOIN users payer ON payer.id = e.paid_by_user_id
       LEFT JOIN expense_splits es ON es.expense_id = e.id
       WHERE e.group_id = ?
       GROUP BY e.id
       ORDER BY e.expense_date DESC, e.id DESC`,
      groupId,
    );
    const payments = await db.all(
      `SELECT p.*, sender.name AS from_name, recipient.name AS to_name
       FROM payments p
       JOIN users sender ON sender.id = p.from_user_id
       JOIN users recipient ON recipient.id = p.to_user_id
       WHERE p.group_id = ?
       ORDER BY p.paid_at DESC, p.id DESC`,
      groupId,
    );
    const ledger = await getGroupBalances(db, groupId);
    return res.json({
      group: { ...group, role: membership.role },
      members,
      invites,
      expenses,
      payments,
      ...ledger,
    });
  });

  app.put('/api/groups/:groupId', auth, async (req, res) => {
    const groupId = Number(req.params.groupId);
    await requireGroupManager(db, groupId, req.user.id);
    const name = cleanText(req.body?.name);
    const type = ['home', 'trip', 'couple', 'other'].includes(req.body?.type)
      ? req.body.type
      : 'other';
    if (!name) return res.status(400).json({ message: 'Group name is required.' });

    await db.run(
      `UPDATE groups
       SET name = ?, type = ?, notes = ?, simplify_debts = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      name,
      type,
      cleanText(req.body?.notes) || null,
      req.body?.simplifyDebts === false ? 0 : 1,
      groupId,
    );
    await addActivity(db, {
      actorUserId: req.user.id,
      groupId,
      action: 'group.updated',
      metadata: { groupName: name },
    });
    return res.json({ group: await db.get('SELECT * FROM groups WHERE id = ?', groupId) });
  });

  app.delete('/api/groups/:groupId', auth, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const membership = await requireMembership(db, groupId, req.user.id);
    if (membership.role !== 'owner') {
      return res.status(403).json({ message: 'Only the group owner can delete this group.' });
    }
    await db.run('DELETE FROM groups WHERE id = ?', groupId);
    return res.status(204).end();
  });

  app.post('/api/groups/:groupId/members', auth, async (req, res) => {
    const groupId = Number(req.params.groupId);
    await requireGroupManager(db, groupId, req.user.id);
    const result = await addKnownUserOrInvite(db, {
      groupId,
      invitedBy: req.user.id,
      email: req.body?.email,
    });
    if (result.kind === 'ignored') {
      return res.status(400).json({ message: 'Email is required.' });
    }
    await addActivity(db, {
      actorUserId: req.user.id,
      groupId,
      action: result.kind === 'member' ? 'member.added' : 'member.invited',
      metadata: { email: result.user?.email || result.email, name: result.user?.name },
    });
    return res.status(201).json(result);
  });

  app.delete('/api/groups/:groupId/members/:userId', auth, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const userId = Number(req.params.userId);
    await requireGroupManager(db, groupId, req.user.id);
    const member = await db.get(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      groupId,
      userId,
    );
    if (!member) return res.status(404).json({ message: 'Group member not found.' });
    if (member.role === 'owner') {
      return res.status(400).json({ message: 'The group owner cannot be removed.' });
    }
    const ledger = await getGroupBalances(db, groupId);
    const balance = ledger.balances.find((item) => item.userId === userId);
    if (balance?.netCents !== 0) {
      return res.status(409).json({ message: 'Settle this member\'s balance before removing them.' });
    }
    await db.run(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      groupId,
      userId,
    );
    await addActivity(db, {
      actorUserId: req.user.id,
      groupId,
      action: 'member.removed',
      metadata: { userId },
    });
    return res.status(204).end();
  });

  app.post('/api/expenses', auth, async (req, res) => {
    const groupId = Number(req.body?.groupId);
    await requireMembership(db, groupId, req.user.id);
    const description = cleanText(req.body?.description);
    const totalCents = toCents(req.body?.amount);
    const paidByUserId = Number(req.body?.paidByUserId || req.user.id);
    const participantIds = Array.isArray(req.body?.participantIds)
      ? req.body.participantIds.map(Number)
      : [];
    if (!description) return res.status(400).json({ message: 'Expense description is required.' });

    const memberRows = await db.all(
      'SELECT user_id FROM group_members WHERE group_id = ?',
      groupId,
    );
    const memberIds = new Set(memberRows.map((row) => row.user_id));
    if (!memberIds.has(paidByUserId) || participantIds.some((id) => !memberIds.has(id))) {
      return res.status(400).json({ message: 'Payer and participants must belong to the group.' });
    }

    const splits = calculateSplits({
      totalCents,
      splitType: req.body?.splitType,
      participantIds,
      splitValues: req.body?.splitValues || {},
    });

    const expenseId = await withTransaction(db, async () => {
      const inserted = await db.run(
        `INSERT INTO expenses
          (group_id, description, amount_cents, currency, paid_by_user_id, split_type,
           expense_date, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        groupId,
        description,
        totalCents,
        cleanText(req.body?.currency) || 'USD',
        paidByUserId,
        req.body.splitType,
        cleanText(req.body?.expenseDate) || new Date().toISOString().slice(0, 10),
        cleanText(req.body?.notes) || null,
        req.user.id,
      );
      for (const split of splits) {
        await db.run(
          `INSERT INTO expense_splits (expense_id, user_id, amount_cents, input_value)
           VALUES (?, ?, ?, ?)`,
          inserted.lastID,
          split.userId,
          split.amountCents,
          split.inputValue,
        );
      }
      await addActivity(db, {
        actorUserId: req.user.id,
        groupId,
        expenseId: inserted.lastID,
        action: 'expense.created',
        metadata: { description, amountCents: totalCents },
      });
      return inserted.lastID;
    });

    return res.status(201).json({ expense: await db.get('SELECT * FROM expenses WHERE id = ?', expenseId) });
  });

  app.get('/api/expenses', auth, async (req, res) => {
    const expenses = await db.all(
      `SELECT e.*, g.name AS group_name, payer.name AS paid_by_name,
              COUNT(es.user_id) AS participant_count,
              COALESCE((SELECT COUNT(*) FROM expense_comments c WHERE c.expense_id = e.id), 0) AS comment_count,
              COALESCE((SELECT mine.amount_cents FROM expense_splits mine
                        WHERE mine.expense_id = e.id AND mine.user_id = ?), 0) AS my_share_cents
       FROM expenses e
       JOIN groups g ON g.id = e.group_id
       JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = ?
       JOIN users payer ON payer.id = e.paid_by_user_id
       LEFT JOIN expense_splits es ON es.expense_id = e.id
       GROUP BY e.id
       ORDER BY e.expense_date DESC, e.id DESC`,
      req.user.id,
      req.user.id,
    );
    return res.json({ expenses });
  });

  app.get('/api/expenses/:expenseId', auth, async (req, res) => {
    const expenseId = Number(req.params.expenseId);
    const expense = await getAccessibleExpense(db, expenseId, req.user.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    const splits = await db.all(
      `SELECT es.*, u.name, u.email
       FROM expense_splits es
       JOIN users u ON u.id = es.user_id
       WHERE es.expense_id = ?
       ORDER BY u.name`,
      expenseId,
    );
    const comments = await db.all(
      `SELECT c.id, c.message, c.created_at, c.user_id, u.name
       FROM expense_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.expense_id = ?
       ORDER BY c.created_at, c.id`,
      expenseId,
    );
    return res.json({ expense, splits, comments });
  });

  app.put('/api/expenses/:expenseId', auth, async (req, res) => {
    const expenseId = Number(req.params.expenseId);
    const existing = await getAccessibleExpense(db, expenseId, req.user.id);
    if (!existing) return res.status(404).json({ message: 'Expense not found.' });
    const groupId = existing.group_id;
    const description = cleanText(req.body?.description);
    const totalCents = toCents(req.body?.amount);
    const paidByUserId = Number(req.body?.paidByUserId);
    const participantIds = (req.body?.participantIds || []).map(Number);
    const memberRows = await db.all('SELECT user_id FROM group_members WHERE group_id = ?', groupId);
    const memberIds = new Set(memberRows.map((row) => row.user_id));
    if (!description || !memberIds.has(paidByUserId) || participantIds.some((id) => !memberIds.has(id))) {
      return res.status(400).json({ message: 'Provide a valid expense and group participants.' });
    }
    const splits = calculateSplits({
      totalCents,
      splitType: req.body?.splitType,
      participantIds,
      splitValues: req.body?.splitValues || {},
    });

    await withTransaction(db, async () => {
      await db.run(
        `UPDATE expenses
         SET description = ?, amount_cents = ?, paid_by_user_id = ?, split_type = ?,
             expense_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        description,
        totalCents,
        paidByUserId,
        req.body.splitType,
        cleanText(req.body?.expenseDate) || existing.expense_date,
        cleanText(req.body?.notes) || null,
        expenseId,
      );
      await db.run('DELETE FROM expense_splits WHERE expense_id = ?', expenseId);
      for (const split of splits) {
        await db.run(
          `INSERT INTO expense_splits (expense_id, user_id, amount_cents, input_value)
           VALUES (?, ?, ?, ?)`,
          expenseId,
          split.userId,
          split.amountCents,
          split.inputValue,
        );
      }
      await addActivity(db, {
        actorUserId: req.user.id,
        groupId,
        expenseId,
        action: 'expense.updated',
        metadata: { description, amountCents: totalCents },
      });
    });
    return res.json({ expense: await db.get('SELECT * FROM expenses WHERE id = ?', expenseId) });
  });

  app.delete('/api/expenses/:expenseId', auth, async (req, res) => {
    const expenseId = Number(req.params.expenseId);
    const expense = await getAccessibleExpense(db, expenseId, req.user.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    await addActivity(db, {
      actorUserId: req.user.id,
      groupId: expense.group_id,
      action: 'expense.deleted',
      metadata: { description: expense.description, amountCents: expense.amount_cents },
    });
    await db.run('DELETE FROM expenses WHERE id = ?', expenseId);
    return res.status(204).end();
  });

  app.post('/api/expenses/:expenseId/comments', auth, async (req, res) => {
    const expenseId = Number(req.params.expenseId);
    const expense = await getAccessibleExpense(db, expenseId, req.user.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    const message = cleanText(req.body?.message);
    if (!message) return res.status(400).json({ message: 'Comment cannot be empty.' });
    const inserted = await db.run(
      `INSERT INTO expense_comments (expense_id, user_id, message)
       VALUES (?, ?, ?)`,
      expenseId,
      req.user.id,
      message,
    );
    const comment = await db.get(
      `SELECT c.id, c.message, c.created_at, c.user_id, u.name
       FROM expense_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      inserted.lastID,
    );
    realtime.publish(`expense:${expenseId}`, 'comment', comment);
    return res.status(201).json({ comment });
  });

  app.get('/api/expenses/:expenseId/comments/stream', async (req, res) => {
    let user;
    try {
      user = readToken(String(req.query.token || ''), jwtSecret);
    } catch {
      return res.status(401).json({ message: 'Invalid stream token.' });
    }
    const expenseId = Number(req.params.expenseId);
    const expense = await getAccessibleExpense(db, expenseId, user.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');
    const unsubscribe = realtime.subscribe(`expense:${expenseId}`, res);
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 20000);
    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.post('/api/payments', auth, async (req, res) => {
    const groupId = Number(req.body?.groupId);
    await requireMembership(db, groupId, req.user.id);
    const fromUserId = Number(req.body?.fromUserId);
    const toUserId = Number(req.body?.toUserId);
    const amountCents = toCents(req.body?.amount);
    const members = await db.all('SELECT user_id FROM group_members WHERE group_id = ?', groupId);
    const memberIds = new Set(members.map((member) => member.user_id));
    if (!memberIds.has(fromUserId) || !memberIds.has(toUserId) || fromUserId === toUserId) {
      return res.status(400).json({ message: 'Choose two different group members.' });
    }
    if (amountCents <= 0) return res.status(400).json({ message: 'Payment must be greater than zero.' });

    const paymentId = await withTransaction(db, async () => {
      const inserted = await db.run(
        `INSERT INTO payments
          (group_id, from_user_id, to_user_id, amount_cents, currency, note, paid_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        groupId,
        fromUserId,
        toUserId,
        amountCents,
        cleanText(req.body?.currency) || 'USD',
        cleanText(req.body?.note) || null,
        cleanText(req.body?.paidAt) || new Date().toISOString().slice(0, 10),
        req.user.id,
      );
      await addActivity(db, {
        actorUserId: req.user.id,
        groupId,
        paymentId: inserted.lastID,
        action: 'payment.created',
        metadata: { fromUserId, toUserId, amountCents },
      });
      return inserted.lastID;
    });
    return res.status(201).json({ payment: await db.get('SELECT * FROM payments WHERE id = ?', paymentId) });
  });

  app.get('/api/groups/:groupId/balances', auth, async (req, res) => {
    const groupId = Number(req.params.groupId);
    await requireMembership(db, groupId, req.user.id);
    return res.json(await getGroupBalances(db, groupId));
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : 'Something went wrong on the server.',
    });
  });

  return app;
}
