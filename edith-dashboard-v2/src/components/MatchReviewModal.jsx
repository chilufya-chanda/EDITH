import { useState, useEffect } from 'react';
import { getAlertFrameUrl, getCasePhotoUrl } from '../services/api.js';

export default function MatchReviewModal({ alert, onClose, onConfirmReviewed }) {
  const [frameUrl, setFrameUrl] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let localFrameUrl = null;
    let localPhotoUrl = null;

    (async () => {
      const [frame, photo] = await Promise.all([
        alert.has_matched_frame ? getAlertFrameUrl(alert.alert_id) : Promise.resolve(null),
        alert.has_enrollment_photo ? getCasePhotoUrl(alert.case_id) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      localFrameUrl = frame;
      localPhotoUrl = photo;
      setFrameUrl(frame);
      setPhotoUrl(photo);
      setLoading(false);
    })();

    // Object URLs hold onto memory until explicitly released — clean up
    // whenever this alert changes or the modal closes.
    return () => {
      cancelled = true;
      if (localFrameUrl) URL.revokeObjectURL(localFrameUrl);
      if (localPhotoUrl) URL.revokeObjectURL(localPhotoUrl);
    };
  }, [alert.alert_id, alert.case_id, alert.has_matched_frame, alert.has_enrollment_photo]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="scan-frame" style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>MATCH REVIEW</div>
            <div style={styles.subtitle}>{alert.full_name} · {alert.case_id}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {loading ? (
          <div style={styles.loading}>Loading images…</div>
        ) : (
          <div style={styles.imageRow}>
            <ImagePane label="CAPTURED BY SPOTTER" url={frameUrl} accent="cyan" />
            <div style={styles.vsLabel}>VS</div>
            <ImagePane label="ORIGINAL ENROLLMENT PHOTO" url={photoUrl} accent="violet" />
          </div>
        )}

        <div style={styles.details}>
          <Detail label="CLASSIFICATION" value={alert.classification?.replace('_', ' ')} />
          <Detail label="CONFIDENCE" value={`${(alert.confidence * 100).toFixed(1)}%`} />
          <Detail label="DEVICE" value={alert.device_uuid} />
          <Detail
            label="LOCATION"
            value={alert.latitude ? `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}` : 'no GPS'}
          />
        </div>

        <div style={styles.actions}>
          <button style={styles.dismissBtn} onClick={onClose}>CLOSE</button>
          {!alert.reviewed && (
            <button
              style={styles.confirmBtn}
              onClick={() => { onConfirmReviewed(alert.alert_id); onClose(); }}
            >
              CONFIRM — MARK REVIEWED
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ImagePane({ label, url, accent }) {
  return (
    <div style={styles.imagePane}>
      <div style={{ ...styles.imageLabel, color: `var(--${accent})` }}>{label}</div>
      <div style={{ ...styles.imageFrame, boxShadow: `0 0 0 1px var(--line)` }}>
        {url ? (
          <img src={url} alt={label} style={styles.image} />
        ) : (
          <div style={styles.noImage}>No image on file</div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div style={styles.detailLabel}>{label}</div>
      <div style={styles.detailValue}>{value}</div>
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

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(2,6,12,0.75)', zIndex: 3000,
    display: 'grid', placeItems: 'center', padding: 20,
  },
  card: {
    width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: '24px 26px',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  title: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, letterSpacing: 1, color: 'var(--text)' },
  subtitle: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', marginTop: 4 },
  closeBtn: {
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
    padding: 6, display: 'flex', cursor: 'pointer',
  },
  loading: { padding: '40px 0', textAlign: 'center', color: 'var(--text-mute)', fontFamily: 'var(--font-mono)', fontSize: 12 },
  imageRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
  imagePane: { flex: 1, minWidth: 0 },
  imageLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, marginBottom: 8, textAlign: 'center',
  },
  imageFrame: {
    aspectRatio: '1 / 1', background: 'var(--base-soft)', display: 'grid', placeItems: 'center',
    overflow: 'hidden', borderRadius: 'var(--radius-sm)',
  },
  image: { width: '100%', height: '100%', objectFit: 'cover', animation: 'portraitBreathe 4s ease-in-out infinite' },
  noImage: { color: 'var(--text-mute)', fontSize: 11, fontFamily: 'var(--font-mono)', padding: 12, textAlign: 'center' },
  vsLabel: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text-mute)' },
  details: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '14px 0',
    borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', marginBottom: 18,
  },
  detailLabel: { fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 },
  detailValue: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)', marginTop: 2 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  dismissBtn: {
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
    padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
  },
  confirmBtn: {
    background: 'var(--cyan)', border: 'none', color: 'var(--base)',
    padding: '10px 18px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, letterSpacing: 1,
  },
};
