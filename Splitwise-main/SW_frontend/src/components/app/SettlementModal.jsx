import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Modal from './Modal.jsx';

export default function SettlementModal({ groups, currentGroup, onClose, onSaved }) {
  const firstGroupId = currentGroup?.group?.id || groups[0]?.id || '';
  const [groupId, setGroupId] = useState(firstGroupId);
  const [groupData, setGroupData] = useState(currentGroup || null);
  const [form, setForm] = useState({
    fromUserId: '',
    toUserId: '',
    amount: '',
    note: '',
    paidAt: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    const source = currentGroup?.group?.id === Number(groupId)
      ? Promise.resolve(currentGroup)
      : api(`/groups/${groupId}`);
    source.then((data) => {
      setGroupData(data);
      const debt = data.debts?.[0];
      const members = data.members || [];
      setForm((current) => ({
        ...current,
        fromUserId: debt?.fromUserId || members[0]?.id || '',
        toUserId: debt?.toUserId || members[1]?.id || '',
        amount: debt ? (debt.amountCents / 100).toFixed(2) : '',
      }));
    }).catch((requestError) => setError(requestError.message));
  }, [currentGroup, groupId]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('/payments', {
        method: 'POST',
        body: JSON.stringify({
          groupId: Number(groupId),
          fromUserId: Number(form.fromUserId),
          toUserId: Number(form.toUserId),
          amount: form.amount,
          note: form.note,
          paidAt: form.paidAt,
          currency: groupData?.group?.currency || 'USD',
        }),
      });
      onSaved(Number(groupId));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Settle up" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body form-stack">
          <label>
            Group
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <div className="settlement-direction">
            <label>
              Who paid
              <select
                value={form.fromUserId}
                onChange={(event) => setForm({ ...form, fromUserId: event.target.value })}
              >
                {(groupData?.members || []).map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </label>
            <span>paid</span>
            <label>
              Who received it
              <select
                value={form.toUserId}
                onChange={(event) => setForm({ ...form, toUserId: event.target.value })}
              >
                {(groupData?.members || []).map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-row">
            <label>
              Amount
              <input
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                placeholder="0.00"
                required
              />
            </label>
            <label>
              Payment date
              <input
                type="date"
                value={form.paidAt}
                onChange={(event) => setForm({ ...form, paidAt: event.target.value })}
              />
            </label>
          </div>
          <label>
            Note
            <input
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder="Cash, UPI, bank transfer..."
            />
          </label>
          {error && <p className="form-message error">{error}</p>}
        </div>
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button teal" disabled={saving || !groupData}>
            {saving ? 'Recording...' : 'Record payment'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
