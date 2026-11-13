import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDate, formatMoney, initials } from '../../lib/format.js';
import CreateGroupModal from './CreateGroupModal.jsx';
import ExpenseDetailModal from './ExpenseDetailModal.jsx';
import ExpenseModal from './ExpenseModal.jsx';
import GroupSettingsModal from './GroupSettingsModal.jsx';
import SettlementModal from './SettlementModal.jsx';
import './workspace.css';

function Avatar({ name, small = false }) {
  return <span className={`avatar ${small ? 'small' : ''}`}>{initials(name)}</span>;
}

function activityText(item) {
  const metadata = item.metadata || {};
  if (item.action === 'group.created') return `created the group "${metadata.groupName}".`;
  if (item.action === 'group.updated') return `updated the group "${metadata.groupName}".`;
  if (item.action === 'member.added') return `added ${metadata.name || metadata.email} to the group.`;
  if (item.action === 'member.invited') return `invited ${metadata.email} to the group.`;
  if (item.action === 'member.removed') return 'removed a member from the group.';
  if (item.action === 'expense.created') return `added "${metadata.description}".`;
  if (item.action === 'expense.updated') return `updated "${metadata.description}".`;
  if (item.action === 'expense.deleted') return `deleted "${metadata.description}".`;
  if (item.action === 'payment.created') return `recorded a payment of ${formatMoney(metadata.amountCents)}.`;
  return item.action.replaceAll('.', ' ');
}

function ExpenseRow({ expense, onOpen }) {
  return (
    <button className="expense-row" type="button" onClick={() => onOpen(expense.id)}>
      <div className="expense-date">
        <span>{new Date(`${expense.expense_date}T00:00:00`).toLocaleString('en', { month: 'short' })}</span>
        <strong>{new Date(`${expense.expense_date}T00:00:00`).getDate()}</strong>
      </div>
      <div className="receipt-icon">R</div>
      <div className="expense-copy">
        <strong>{expense.description}</strong>
        <span>{expense.group_name || `${expense.participant_count} people`}</span>
      </div>
      <div className="expense-paid">
        <span>{expense.paid_by_name} paid</span>
        <strong>{formatMoney(expense.amount_cents, expense.currency)}</strong>
      </div>
      <div className="expense-comments">
        {expense.comment_count ? `${expense.comment_count} chat` : 'Open'}
      </div>
    </button>
  );
}

export default function Workspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const { groupId } = useParams();
  const userMenuRef = useRef(null);
  const [bootstrap, setBootstrap] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [allExpenses, setAllExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [notice, setNotice] = useState('');

  const page = groupId
    ? 'group'
    : location.pathname.includes('/activity')
      ? 'activity'
      : location.pathname.includes('/expenses')
        ? 'expenses'
        : 'dashboard';

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await api('/bootstrap');
      setBootstrap(data);
      setError('');
      return data;
    } catch (requestError) {
      if (requestError.status === 401) {
        localStorage.removeItem('sw_token');
        navigate('/login');
        return null;
      }
      setError(requestError.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const loadGroup = useCallback(async (id) => {
    if (!id) {
      setGroupData(null);
      return null;
    }
    try {
      const data = await api(`/groups/${id}`);
      setGroupData(data);
      setError('');
      return data;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    try {
      const data = await api('/expenses');
      setAllExpenses(data.expenses);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (groupId) loadGroup(Number(groupId));
    else setGroupData(null);
  }, [groupId, loadGroup]);

  useEffect(() => {
    if (page === 'expenses') loadExpenses();
  }, [loadExpenses, page]);

  useEffect(() => {
    function closeMenu(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  const currentUser = bootstrap?.user;
  const groups = useMemo(() => bootstrap?.groups || [], [bootstrap]);
  const currentGroup = groupData?.group;
  const currency = currentGroup?.currency || 'USD';

  const title = currentGroup?.name
    || (page === 'activity' ? 'Recent activity' : page === 'expenses' ? 'All expenses' : 'Dashboard');

  const totalOwed = useMemo(
    () => groups.filter((group) => group.netCents > 0).reduce((sum, group) => sum + group.netCents, 0),
    [groups],
  );
  const totalOwing = useMemo(
    () => groups.filter((group) => group.netCents < 0).reduce((sum, group) => sum + Math.abs(group.netCents), 0),
    [groups],
  );

  async function sendFriendInvite(event) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      const data = await api('/friends/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail }),
      });
      setNotice(data.status === 'added' ? 'Friend added.' : 'Invitation recorded.');
      setInviteEmail('');
      loadBootstrap();
    } catch (requestError) {
      setNotice(requestError.message);
    }
  }

  function logout() {
    localStorage.removeItem('sw_token');
    navigate('/login');
  }

  async function refreshAfterChange(close = true) {
    await loadBootstrap();
    if (groupId) await loadGroup(Number(groupId));
    if (page === 'expenses') await loadExpenses();
    if (close) setModal(null);
  }

  function handleExpenseSaved(savedGroupId) {
    setModal(null);
    loadBootstrap();
    if (Number(groupId) === savedGroupId) loadGroup(savedGroupId);
    if (page === 'expenses') loadExpenses();
  }

  function handleGroupCreated(group) {
    setModal(null);
    loadBootstrap();
    navigate(`/app/groups/${group.id}`);
  }

  function handleGroupDeleted() {
    setModal(null);
    loadBootstrap();
    navigate('/app');
  }

  if (loading || !currentUser) {
    return <div className="app-loading">Loading your ledger...</div>;
  }

  return (
    <div className="workspace">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <button className="app-brand" type="button" onClick={() => navigate('/app')}>
            <img src="/logo.png" alt="" />
            <span>Splitwise</span>
          </button>
          <div className="topbar-user" ref={userMenuRef}>
            <button type="button" onClick={() => setUserMenuOpen((open) => !open)}>
              <Avatar name={currentUser.name} small />
              <span>{currentUser.name}</span>
              <span className="caret">v</span>
            </button>
            {userMenuOpen && (
              <div className="user-menu">
                <button onClick={() => setModal('group')}>Create a group</button>
                <button onClick={logout}>Log out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="left-rail">
          <nav className="workspace-nav">
            <button className={page === 'dashboard' ? 'active' : ''} onClick={() => navigate('/app')}>
              <span>D</span>Dashboard
            </button>
            <button className={page === 'activity' ? 'active' : ''} onClick={() => navigate('/app/activity')}>
              <span>A</span>Recent activity
            </button>
            <button className={page === 'expenses' ? 'active' : ''} onClick={() => navigate('/app/expenses')}>
              <span>E</span>All expenses
            </button>
          </nav>

          <div className="rail-section">
            <div className="rail-heading">
              <span>GROUPS</span>
              <button type="button" onClick={() => setModal('group')}>+ add</button>
            </div>
            {!groups.length && <p className="rail-empty">You do not have any groups yet.</p>}
            {groups.map((group) => (
              <button
                className={`group-link ${Number(groupId) === group.id ? 'active' : ''}`}
                type="button"
                onClick={() => navigate(`/app/groups/${group.id}`)}
                key={group.id}
              >
                <span>{group.type === 'trip' ? 'T' : group.type === 'home' ? 'H' : 'G'}</span>
                <span>{group.name}</span>
                {group.netCents !== 0 && (
                  <small className={group.netCents > 0 ? 'positive' : 'negative'}>
                    {formatMoney(Math.abs(group.netCents), group.currency)}
                  </small>
                )}
              </button>
            ))}
          </div>

          <div className="rail-section">
            <div className="rail-heading"><span>FRIENDS</span></div>
            {!bootstrap.friends.length && <p className="rail-empty">No friends added yet.</p>}
            {bootstrap.friends.map((friend) => (
              <div className="friend-link" key={friend.id}>
                <Avatar name={friend.name} small />
                <span>{friend.name}</span>
              </div>
            ))}
          </div>

          <form className="invite-card" onSubmit={sendFriendInvite}>
            <strong>Invite friends</strong>
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="Enter an email address"
            />
            <button type="submit">Send invite</button>
            {notice && <small>{notice}</small>}
          </form>
        </aside>

        <main className="ledger-main">
          <header className="ledger-header">
            <div>
              {currentGroup && <span className="group-type-badge">{currentGroup.type[0].toUpperCase()}</span>}
              <h1>{title}</h1>
              {currentGroup && <small>{groupData.members.length} people</small>}
            </div>
            <div className="ledger-actions">
              <button className="button primary" onClick={() => setModal('expense')}>Add an expense</button>
              <button className="button teal" onClick={() => setModal('settlement')}>Settle up</button>
            </div>
          </header>

          {error && <div className="page-error">{error}</div>}

          {page === 'dashboard' && (
            <div className="dashboard-content">
              <section className="welcome-panel">
                <p className="eyebrow">Shared expenses, minus the confusion</p>
                <h2>Welcome back, {currentUser.name.split(' ')[0]}.</h2>
                <p>Create a group, add an expense, and the ledger will keep every balance exact.</p>
                {!groups.length && (
                  <button className="button primary" onClick={() => setModal('group')}>
                    Create your first group
                  </button>
                )}
              </section>
              <section className="summary-strip">
                <div>
                  <span>Total balance</span>
                  <strong className={bootstrap.totalBalanceCents >= 0 ? 'positive' : 'negative'}>
                    {formatMoney(bootstrap.totalBalanceCents)}
                  </strong>
                </div>
                <div><span>You are owed</span><strong className="positive">{formatMoney(totalOwed)}</strong></div>
                <div><span>You owe</span><strong className="negative">{formatMoney(totalOwing)}</strong></div>
              </section>
              <section className="dashboard-groups">
                <div className="section-title">
                  <h3>Your groups</h3>
                  <button onClick={() => setModal('group')}>New group</button>
                </div>
                {groups.map((group) => (
                  <button key={group.id} onClick={() => navigate(`/app/groups/${group.id}`)}>
                    <span className="group-tile-icon">{group.type[0].toUpperCase()}</span>
                    <span>
                      <strong>{group.name}</strong>
                      <small>{group.memberCount} members</small>
                    </span>
                    <b className={group.netCents >= 0 ? 'positive' : 'negative'}>
                      {group.netCents === 0 ? 'settled' : formatMoney(group.netCents, group.currency)}
                    </b>
                  </button>
                ))}
              </section>
            </div>
          )}

          {page === 'activity' && (
            <div className="activity-list">
              {!bootstrap.activity.length && <div className="empty-state"><h2>No activity yet</h2></div>}
              {bootstrap.activity.map((item) => (
                <div className="activity-row" key={item.id}>
                  <Avatar name={item.actor_name} />
                  <div>
                    <p><strong>{item.actor_user_id === currentUser.id ? 'You' : item.actor_name}</strong> {activityText(item)}</p>
                    <span>{item.group_name || 'Personal'} - {new Date(item.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {page === 'expenses' && (
            <div className="expense-list">
              {!allExpenses.length && (
                <div className="empty-state">
                  <div className="empty-receipt">R</div>
                  <h2>You have not added any expenses yet</h2>
                  <p>Use the orange button to add your first shared expense.</p>
                </div>
              )}
              {allExpenses.map((expense) => (
                <ExpenseRow expense={expense} onOpen={setSelectedExpenseId} key={expense.id} />
              ))}
            </div>
          )}

          {page === 'group' && groupData && (
            <div className="group-content">
              {!groupData.expenses.length && !groupData.payments.length && (
                <div className="empty-state group-empty">
                  <div className="empty-receipt">R</div>
                  <h2>You have not added any expenses yet</h2>
                  <p>Add an expense to start calculating balances for this group.</p>
                </div>
              )}
              {groupData.expenses.map((expense) => (
                <ExpenseRow
                  expense={{ ...expense, group_name: currentGroup.name }}
                  onOpen={setSelectedExpenseId}
                  key={`expense-${expense.id}`}
                />
              ))}
              {groupData.payments.map((payment) => (
                <div className="payment-row" key={`payment-${payment.id}`}>
                  <div className="payment-icon">$</div>
                  <div>
                    <strong>{payment.from_name} paid {payment.to_name}</strong>
                    <span>{formatDate(payment.paid_at)}{payment.note ? ` - ${payment.note}` : ''}</span>
                  </div>
                  <b>{formatMoney(payment.amount_cents, payment.currency)}</b>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="right-rail">
          {page !== 'group' && (
            <>
              <p className="eyebrow">Your total balance</p>
              <strong className={`right-total ${bootstrap.totalBalanceCents >= 0 ? 'positive' : 'negative'}`}>
                {formatMoney(bootstrap.totalBalanceCents)}
              </strong>
              <p className="right-copy">
                {bootstrap.totalBalanceCents === 0
                  ? 'You are all settled up.'
                  : bootstrap.totalBalanceCents > 0 ? 'Overall, you are owed money.' : 'Overall, you owe money.'}
              </p>
            </>
          )}
          {page === 'group' && groupData && (
            <>
              <div className="right-tools">
                <button title="Group settings" onClick={() => setModal('settings')}>Settings</button>
              </div>
              <p className="eyebrow">Group balances</p>
              <div className="balance-list">
                {groupData.balances.map((balance) => (
                  <div key={balance.userId}>
                    <Avatar name={balance.name} small />
                    <span>
                      <strong>{balance.name}</strong>
                      <small className={balance.netCents > 0 ? 'positive' : balance.netCents < 0 ? 'negative' : ''}>
                        {balance.netCents === 0
                          ? 'settled up'
                          : balance.netCents > 0
                            ? `gets ${formatMoney(balance.netCents, currency)}`
                            : `owes ${formatMoney(Math.abs(balance.netCents), currency)}`}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              <p className="eyebrow debt-heading">Suggested settlements</p>
              {!groupData.debts.length && <p className="right-copy">No debts in this group.</p>}
              {groupData.debts.map((debt, index) => (
                <div className="debt-row" key={`${debt.fromUserId}-${debt.toUserId}-${index}`}>
                  <span>{debt.fromName} pays {debt.toName}</span>
                  <strong>{formatMoney(debt.amountCents, currency)}</strong>
                </div>
              ))}
              {currentGroup.notes && (
                <>
                  <p className="eyebrow debt-heading">Group notes</p>
                  <p className="group-notes">{currentGroup.notes}</p>
                </>
              )}
            </>
          )}
        </aside>
      </div>

      {modal === 'group' && (
        <CreateGroupModal onClose={() => setModal(null)} onCreated={handleGroupCreated} />
      )}
      {modal === 'expense' && (
        <ExpenseModal
          groups={groups}
          currentGroup={groupData}
          currentUser={currentUser}
          onClose={() => setModal(null)}
          onSaved={handleExpenseSaved}
        />
      )}
      {modal === 'settlement' && (
        <SettlementModal
          groups={groups}
          currentGroup={groupData}
          onClose={() => setModal(null)}
          onSaved={handleExpenseSaved}
        />
      )}
      {modal === 'settings' && groupData && (
        <GroupSettingsModal
          data={groupData}
          currentUser={currentUser}
          onClose={() => setModal(null)}
          onChanged={refreshAfterChange}
          onDeleted={handleGroupDeleted}
        />
      )}
      {selectedExpenseId && (
        <ExpenseDetailModal
          expenseId={selectedExpenseId}
          currentUser={currentUser}
          onClose={() => setSelectedExpenseId(null)}
          onDeleted={() => {
            setSelectedExpenseId(null);
            refreshAfterChange(false);
          }}
        />
      )}
    </div>
  );
}
