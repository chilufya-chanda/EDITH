import { useState } from 'react';
import GeofenceControl from './GeofenceControl.jsx';

const STATUS_COLOR = {
  active: 'var(--cyan)',
  enrolled: 'var(--text-dim)',
  found: 'var(--violet)',
  expired: 'var(--text-mute)',
  cancelled: 'var(--text-mute)',
};

export default function CaseList({ cases, selectedCaseId, onSelect, onActivate, onExpire, onDelete, onNewCase, onCaseUpdated, onGeofencePreview }) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  function handleDeleteClick(e, caseId) {
    e.stopPropagation();
    if (confirmingDeleteId === caseId) {
      onDelete(caseId);
      setConfirmingDeleteId(null);
    } else {
      setConfirmingDeleteId(caseId);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span>CASE FILES</span>
        <button style={styles.newBtn} onClick={onNewCase}>+ ENROLL</button>
      </div>

      <div style={styles.list}>
        {cases.length === 0 && (
          <div style={styles.empty}>No cases enrolled yet. Enroll one to begin.</div>
        )}
        {cases.map((c) => (
          <div
            key={c.case_id}
            className={`scan-frame hoverable ${selectedCaseId === c.case_id ? 'active' : ''}`}
            style={styles.card}
            onClick={() => onSelect(c.case_id)}
          >
            <div style={styles.cardTop}>
              <div style={styles.name}>{c.full_name}</div>
              <span style={{ ...styles.badge, color: STATUS_COLOR[c.status] || 'var(--text-dim)' }}>
                {c.status?.toUpperCase()}
              </span>
            </div>
            <div style={styles.caseId}>{c.case_id}</div>

            <div style={styles.actions}>
              {c.status !== 'active' && (
                <button style={styles.actionBtn} onClick={(e) => { e.stopPropagation(); onActivate(c.case_id); }}>
                  ACTIVATE
                </button>
              )}
              {c.status === 'active' && (
                <button style={{ ...styles.actionBtn, color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); onExpire(c.case_id); }}>
                  CLOSE CASE
                </button>
              )}
              <button
                style={{
                  ...styles.actionBtn,
                  ...(confirmingDeleteId === c.case_id ? styles.deleteBtnConfirm : styles.deleteBtn),
                }}
                onClick={(e) => handleDeleteClick(e, c.case_id)}
                onMouseLeave={() => confirmingDeleteId === c.case_id && setConfirmingDeleteId(null)}
              >
                {confirmingDeleteId === c.case_id ? 'CONFIRM DELETE?' : 'DELETE'}
              </button>
            </div>

            {c.status === 'active' && (
              <GeofenceControl caseData={c} onUpdated={onCaseUpdated} onPreview={onGeofencePreview} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, color: 'var(--text-dim)',
    padding: '14px 14px 10px',
  },
  newBtn: {
    background: 'transparent', border: '1px solid var(--cyan)', color: 'var(--cyan)',
    fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 8px', letterSpacing: 1,
  },
  list: { overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 },
  empty: { color: 'var(--text-mute)', fontSize: 12, padding: 20, textAlign: 'center' },
  card: { padding: '12px 14px', cursor: 'pointer' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 },
  badge: { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1 },
  caseId: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)', marginTop: 2 },
  actions: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  actionBtn: {
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)', fontSize: 10, padding: '5px 9px', letterSpacing: 0.5,
  },
  deleteBtn: { color: 'var(--text-mute)' },
  deleteBtnConfirm: { background: 'var(--red)', borderColor: 'var(--red)', color: '#fff', fontWeight: 700 },
};
