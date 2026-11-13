import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney, initials } from '../../lib/format.js';
import Modal from './Modal.jsx';

const splitOptions = [
  ['equal', 'Equal'],
  ['exact', 'Exact amounts'],
  ['percentage', 'Percentages'],
  ['shares', 'Shares'],
];

export default function ExpenseModal({
  groups,
  currentGroup,
  currentUser,
  onClose,
  onSaved,
}) {
  const firstGroupId = currentGroup?.group?.id || groups[0]?.id || '';
  const [groupId, setGroupId] = useState(firstGroupId);
  const [groupData, setGroupData] = useState(currentGroup || null);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    paidByUserId: currentUser.id,
    splitType: 'equal',
    notes: '',
  });
  const [participants, setParticipants] = useState([]);
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    if (currentGroup?.group?.id === Number(groupId)) {
      setGroupData(currentGroup);
      return;
    }
    api(`/groups/${groupId}`)
      .then(setGroupData)
      .catch((requestError) => setError(requestError.message));
  }, [currentGroup, groupId]);

  useEffect(() => {
    if (!groupData?.members?.length) return;
    const ids = groupData.members.map((member) => member.id);
    setParticipants(ids);
    setForm((current) => ({
      ...current,
      paidByUserId: ids.includes(Number(current.paidByUserId))
        ? current.paidByUserId
        : currentUser.id,
    }));
    setValues(Object.fromEntries(ids.map((id) => [id, ''])));
  }, [currentUser.id, groupData]);

  const amountCents = Math.round((Number(form.amount) || 0) * 100);
  const equalShare = participants.length ? Math.floor(amountCents / participants.length) : 0;
  const selectedMembers = useMemo(
    () => (groupData?.members || []).filter((member) => participants.includes(member.id)),
    [groupData, participants],
  );

  function toggleParticipant(userId) {
    setParticipants((current) => (
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    ));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          groupId: Number(groupId),
          description: form.description,
          amount: form.amount,
          expenseDate: form.expenseDate,
          paidByUserId: Number(form.paidByUserId),
          splitType: form.splitType,
          participantIds: participants,
          splitValues: values,
          notes: form.notes,
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

  if (!groups.length) {
    return (
      <Modal title="Add an expense" onClose={onClose}>
        <div className="modal-body empty-modal">
          <p>Create a group before adding an expense.</p>
        </div>
        <footer className="modal-actions">
          <button className="button secondary" onClick={onClose}>Close</button>
        </footer>
      </Modal>
    );
  }

  return (
    <Modal title="Add an expense" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="modal-body expense-grid">
          <div className="expense-basics form-stack">
            <label>
              Group
              <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label>
              Description
              <input
                autoFocus
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Dinner, taxi, hotel..."
                required
              />
            </label>
            <div className="field-row">
              <label>
                Amount
                <div className="money-input">
                  <span>$</span>
                  <input
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(event) => setForm({ ...form, amount: event.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={form.expenseDate}
                  onChange={(event) => setForm({ ...form, expenseDate: event.target.value })}
                />
              </label>
            </div>
            <label>
              Paid by
              <select
                value={form.paidByUserId}
                onChange={(event) => setForm({ ...form, paidByUserId: event.target.value })}
              >
                {(groupData?.members || []).map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea
                rows="3"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Optional details"
              />
            </label>
          </div>

          <div className="split-panel">
            <p className="eyebrow">Choose split options</p>
            <div className="split-tabs">
              {splitOptions.map(([value, label]) => (
                <button
                  key={value}
                  className={form.splitType === value ? 'active' : ''}
                  type="button"
                  onClick={() => setForm({ ...form, splitType: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="participant-list">
              {(groupData?.members || []).map((member) => {
                const checked = participants.includes(member.id);
                return (
                  <div className={`participant-row ${checked ? '' : 'muted'}`} key={member.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParticipant(member.id)}
                      aria-label={`Include ${member.name}`}
                    />
                    <span className="avatar small">{initials(member.name)}</span>
                    <span className="participant-name">{member.name}</span>
                    {checked && form.splitType === 'equal' && (
                      <strong>{formatMoney(equalShare, groupData?.group?.currency)}</strong>
                    )}
                    {checked && form.splitType !== 'equal' && (
                      <div className="split-value">
                        {form.splitType === 'exact' && <span>$</span>}
                        <input
                          inputMode="decimal"
                          value={values[member.id] || ''}
                          onChange={(event) => setValues({ ...values, [member.id]: event.target.value })}
                          placeholder={form.splitType === 'shares' ? '1' : '0'}
                        />
                        {form.splitType === 'percentage' && <span>%</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="split-summary">
              <span>{selectedMembers.length} participants</span>
              <strong>{formatMoney(amountCents, groupData?.group?.currency)}</strong>
            </div>
          </div>
          {error && <p className="form-message error expense-error">{error}</p>}
        </div>
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={saving || !groupData}>
            {saving ? 'Saving...' : 'Save expense'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
