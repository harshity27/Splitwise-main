import { useState } from 'react';
import { api } from '../../lib/api.js';
import Modal from './Modal.jsx';

export default function CreateGroupModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', type: 'trip', emails: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = await api('/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          memberEmails: form.emails.split(',').map((email) => email.trim()).filter(Boolean),
        }),
      });
      onCreated(data.group);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Start a new group" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body form-stack">
          <label>
            Group name
            <input
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Weekend in Goa"
              required
            />
          </label>
          <label>
            Group type
            <select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
            >
              <option value="trip">Trip</option>
              <option value="home">Home</option>
              <option value="couple">Couple</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Invite members
            <textarea
              value={form.emails}
              onChange={(event) => setForm({ ...form, emails: event.target.value })}
              placeholder="alex@example.com, sam@example.com"
              rows="3"
            />
            <small>Existing users join immediately. Other emails stay as pending invitations.</small>
          </label>
          {error && <p className="form-message error">{error}</p>}
        </div>
        <footer className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create group'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
