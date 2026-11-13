import { useEffect, useState } from 'react';
import { api, expenseStreamUrl } from '../../lib/api.js';
import { formatDate, formatMoney, initials } from '../../lib/format.js';
import Modal from './Modal.jsx';

export default function ExpenseDetailModal({ expenseId, currentUser, onClose, onDeleted }) {
  const [detail, setDetail] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api(`/expenses/${expenseId}`).then(setDetail).catch((requestError) => setError(requestError.message));
  }, [expenseId]);

  useEffect(() => {
    const source = new EventSource(expenseStreamUrl(expenseId));
    source.addEventListener('comment', (event) => {
      const comment = JSON.parse(event.data);
      setDetail((current) => {
        if (!current || current.comments.some((item) => item.id === comment.id)) return current;
        return { ...current, comments: [...current.comments, comment] };
      });
    });
    return () => source.close();
  }, [expenseId]);

  async function sendComment(event) {
    event.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      const data = await api(`/expenses/${expenseId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      setDetail((current) => ({
        ...current,
        comments: current.comments.some((item) => item.id === data.comment.id)
          ? current.comments
          : [...current.comments, data.comment],
      }));
      setMessage('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  async function removeExpense() {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api(`/expenses/${expenseId}`, { method: 'DELETE' });
      onDeleted();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <Modal title="Expense details" onClose={onClose} wide>
      <div className="modal-body detail-grid">
        {!detail && !error && <p>Loading expense...</p>}
        {error && <p className="form-message error">{error}</p>}
        {detail && (
          <>
            <section className="expense-detail">
              <p className="eyebrow">{detail.expense.group_name}</p>
              <h3>{detail.expense.description}</h3>
              <p className="detail-amount">
                {formatMoney(detail.expense.amount_cents, detail.expense.currency)}
              </p>
              <p>
                Paid on {formatDate(detail.expense.expense_date)} by {detail.expense.paid_by_name}
              </p>
              {detail.expense.notes && <p className="detail-notes">{detail.expense.notes}</p>}
              <h4>Split</h4>
              <div className="split-breakdown">
                {detail.splits.map((split) => (
                  <div key={split.user_id}>
                    <span className="avatar small">{initials(split.name)}</span>
                    <span>{split.name}</span>
                    <strong>{formatMoney(split.amount_cents, detail.expense.currency)}</strong>
                  </div>
                ))}
              </div>
              <button className="text-button danger" type="button" onClick={removeExpense}>
                Delete expense
              </button>
            </section>
            <section className="expense-chat">
              <div className="chat-heading">
                <div>
                  <p className="eyebrow">Expense chat</p>
                  <h3>Conversation</h3>
                </div>
                <span className="live-badge">Live</span>
              </div>
              <div className="chat-list">
                {!detail.comments.length && (
                  <p className="empty-chat">Start a conversation about this expense.</p>
                )}
                {detail.comments.map((comment) => (
                  <div
                    className={`chat-message ${comment.user_id === currentUser.id ? 'mine' : ''}`}
                    key={comment.id}
                  >
                    <span className="avatar small">{initials(comment.name)}</span>
                    <div>
                      <strong>{comment.name}</strong>
                      <p>{comment.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form className="chat-form" onSubmit={sendComment}>
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Write a message..."
                />
                <button className="button teal" disabled={sending}>Send</button>
              </form>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
