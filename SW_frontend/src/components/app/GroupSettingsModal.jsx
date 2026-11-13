import { useState } from 'react';
import { api } from '../../lib/api.js';
import { initials } from '../../lib/format.js';
import Modal from './Modal.jsx';

export default function GroupSettingsModal({ data, currentUser, onClose, onChanged, onDeleted }) {
  const [form, setForm] = useState({
    name: data.group.name,
    type: data.group.type,
    notes: data.group.notes || '',
    simplifyDebts: Boolean(data.group.simplify_debts),
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/groups/${data.group.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      onChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function invite(event) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      await api(`/groups/${data.group.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail }),
      });
      setInviteEmail('');
      onChanged(false);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function removeMember(userId) {
    try {
      await api(`/groups/${data.group.id}/members/${userId}`, { method: 'DELETE' });
      onChanged(false);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteGroup() {
    if (!window.confirm(`Delete "${data.group.name}" and all of its expenses?`)) return;
    try {
      await api(`/groups/${data.group.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const canManage = ['owner', 'admin'].includes(data.group.role);

  return (
    <Modal title="Group settings" onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="modal-body settings-grid">
          <section className="form-stack">
            <label>
              Group name
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                disabled={!canManage}
              />
            </label>
            <label>
              Group type
              <select
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value })}
                disabled={!canManage}
              >
                <option value="trip">Trip</option>
                <option value="home">Home</option>
                <option value="couple">Couple</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Group notes
              <textarea
                rows="4"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Shared address, booking number, reminders..."
                disabled={!canManage}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.simplifyDebts}
                onChange={(event) => setForm({ ...form, simplifyDebts: event.target.checked })}
                disabled={!canManage}
              />
              Simplify debts
            </label>
            {data.group.role === 'owner' && (
              <button className="text-button danger align-left" type="button" onClick={deleteGroup}>
                Delete group
              </button>
            )}
          </section>
          <section>
            <p className="eyebrow">Group members</p>
            <div className="member-management">
              {data.members.map((member) => (
                <div key={member.id}>
                  <span className="avatar small">{initials(member.name)}</span>
                  <span>
                    <strong>{member.name}</strong>
                    <small>{member.email} - {member.role}</small>
                  </span>
                  {canManage && member.id !== currentUser.id && member.role !== 'owner' && (
                    <button type="button" onClick={() => removeMember(member.id)}>Remove</button>
                  )}
                </div>
              ))}
              {data.invites.map((invite) => (
                <div key={`invite-${invite.id}`} className="pending-member">
                  <span className="avatar small">?</span>
                  <span>
                    <strong>{invite.email}</strong>
                    <small>Invitation pending</small>
                  </span>
                </div>
              ))}
            </div>
            {canManage && (
              <div className="inline-invite">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="person@example.com"
                />
                <button className="button secondary" type="button" onClick={invite}>Invite</button>
              </div>
            )}
          </section>
          {error && <p className="form-message error settings-error">{error}</p>}
        </div>
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          {canManage && (
            <button className="button primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          )}
        </footer>
      </form>
    </Modal>
  );
}
