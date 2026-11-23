import { useState } from 'react';

// Deliberately a placeholder — see the "Request Integration" flow below.
// No real connection is made anywhere; this exists to demonstrate the
// system's architecture supports this expansion path, pending a real
// institutional partnership agreement (see the project's JETS report,
// Section 6.1 — this is precisely the kind of resource ask that can't be
// simulated honestly with code alone).
const NETWORKS = [
  { id: 'traffic', name: 'City Traffic Camera Network', operator: 'Municipal Roads Authority', cameras: 214 },
  { id: 'transit', name: 'Bus & Rail Station CCTV', operator: 'National Transit Authority', cameras: 87 },
  { id: 'utility', name: 'Utility Substation Cameras', operator: 'National Power Utility', cameras: 46 },
  { id: 'retail', name: 'Retail & Market Security Feeds', operator: 'Independent Retail Consortium', cameras: 132 },
];

export default function CctvIntegrationsModal({ onClose }) {
  const [requested, setRequested] = useState({});

  function requestIntegration(id) {
    setRequested((prev) => ({ ...prev, [id]: true }));
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="scan-frame" style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>EXTERNAL CAMERA NETWORKS</div>
            <div style={styles.subtitle}>Extend spotting coverage beyond citizen devices</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>

        <div style={styles.noticeBox}>
          <InfoIcon />
          <span>
            These are illustrative — no camera network is actually connected. Enabling any of
            these requires a real institutional agreement with the operator (data-sharing terms,
            legal review, and technical integration on their side), not something this software
            alone can switch on. This panel exists to show the system's architecture is built to
            support it once that partnership exists.
          </span>
        </div>

        <div style={styles.list}>
          {NETWORKS.map((n) => (
            <div key={n.id} className="scan-frame hoverable" style={styles.networkCard}>
              <div style={styles.networkTop}>
                <div>
                  <div style={styles.networkName}>{n.name}</div>
                  <div style={styles.networkOperator}>{n.operator}</div>
                </div>
                <div style={styles.cameraCount}>
                  <CameraIcon />
                  {n.cameras}
                </div>
              </div>
              <div style={styles.networkActions}>
                <span style={styles.statusTag}>NOT CONNECTED</span>
                <button
                  style={{ ...styles.requestBtn, ...(requested[n.id] ? styles.requestBtnSent : {}) }}
                  onClick={() => requestIntegration(n.id)}
                  disabled={requested[n.id]}
                >
                  {requested[n.id] ? 'REQUEST LOGGED' : 'REQUEST INTEGRATION'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.actions}>
          <button style={styles.dismissBtn} onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(2,6,12,0.75)', zIndex: 3000,
    display: 'grid', placeItems: 'center', padding: 20,
  },
  card: { width: '100%', maxWidth: 620, maxHeight: '88vh', overflowY: 'auto', padding: '24px 26px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: 1, color: 'var(--text)' },
  subtitle: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 4 },
  closeBtn: {
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)', padding: 6, display: 'flex',
  },
  noticeBox: {
    display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 11.5, lineHeight: 1.55,
    marginBottom: 18, padding: 12, border: '1px solid var(--line)',
    background: 'var(--base-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--amber)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 },
  networkCard: { padding: '12px 14px' },
  networkTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  networkName: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, color: 'var(--text)' },
  networkOperator: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 },
  cameraCount: {
    display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 11,
    color: 'var(--cyan)', flexShrink: 0,
  },
  networkActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  statusTag: { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 0.5, color: 'var(--text-mute)' },
  requestBtn: {
    background: 'transparent', border: '1px solid var(--cyan)', color: 'var(--cyan)',
    fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 0.5, padding: '6px 10px',
  },
  requestBtnSent: {
    background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text-mute)',
  },
  actions: { display: 'flex', justifyContent: 'flex-end' },
  dismissBtn: {
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
    padding: '10px 18px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
  },
};
