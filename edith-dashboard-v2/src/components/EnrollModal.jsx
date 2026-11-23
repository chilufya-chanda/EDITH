import { useState } from 'react';
import { api } from '../services/api.js';

export default function EnrollModal({ onClose, onEnrolled }) {
  const [form, setForm] = useState({
    full_name: '', guardian_name: '', guardian_contact: '',
    care_notes: '', consent_signed_by: '', id_number: '',
  });
  const [photo, setPhoto] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!photo || !confirmed) {
      setError('A photo and explicit consent confirmation are both required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      data.append('photo', photo);
      const result = await api.createCase(data);
      onEnrolled(result);
    } catch (err) {
      setError(err.message || 'Enrollment failed. Check the required fields and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <form
        className="scan-frame"
        style={styles.card}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >

        <div style={styles.title}>ENROLL NEW CASE</div>

        <Field label="Full Name" required>
          <input style={styles.input} value={form.full_name} onChange={update('full_name')} required />
        </Field>
        <Field label="Guardian Name">
          <input style={styles.input} value={form.guardian_name} onChange={update('guardian_name')} />
        </Field>
        <Field label="Guardian Contact">
          <input style={styles.input} value={form.guardian_contact} onChange={update('guardian_contact')} />
        </Field>
        <Field label="Care Notes">
          <textarea style={{ ...styles.input, height: 60 }} value={form.care_notes} onChange={update('care_notes')} />
        </Field>
        <Field label="ID Number (optional, self-supplied only)">
          <input style={styles.input} value={form.id_number} onChange={update('id_number')} />
        </Field>
        <Field label="Consent Signed By" required>
          <input style={styles.input} value={form.consent_signed_by} onChange={update('consent_signed_by')} required />
        </Field>
        <Field label="Enrollment Photo" required>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} required />
        </Field>

        <label style={styles.consentBox}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>
            I confirm I am enrolling this person with their knowledge and agreement, or as
            their authorised guardian. Their photo will be used to generate a face
            signature for this case, shared with spotter devices only if activated, and
            will also be kept (encrypted) so an officer can visually compare it against
            any reported match before acting on it. Both the photo and the signature are
            permanently deleted the moment this case is deleted.
          </span>
        </label>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button type="button" style={styles.cancelBtn} onClick={onClose}>CANCEL</button>
          <button type="submit" style={styles.submitBtn} disabled={submitting}>
            {submitting ? 'ENROLLING…' : 'CREATE CASE FILE'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
        {label}{required && <span style={{ color: 'var(--red)' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000,
    display: 'grid', placeItems: 'center',
  },
  card: {
    width: 480, maxHeight: '85vh', overflowY: 'auto', padding: '28px 26px',
  },
  title: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: 1, marginBottom: 18 },
  input: {
    width: '100%', background: 'var(--base)', border: '1px solid var(--line)', color: 'var(--text)',
    padding: '9px 10px', fontFamily: 'var(--font-body)', fontSize: 13,
  },
  consentBox: {
    display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 11, color: 'var(--text-dim)',
    lineHeight: 1.5, margin: '14px 0', padding: 10, border: '1px solid var(--line)', background: 'var(--base)',
    borderRadius: 'var(--radius-sm)',
  },
  error: { color: 'var(--red)', fontSize: 12, marginBottom: 10, fontFamily: 'var(--font-mono)' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn: {
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
    padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
  },
  submitBtn: {
    background: 'var(--cyan)', border: 'none', color: 'var(--base)',
    padding: '10px 18px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12, letterSpacing: 1,
  },
};
