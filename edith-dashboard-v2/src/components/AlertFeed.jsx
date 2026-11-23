import { useState } from 'react';
import MatchReviewModal from './MatchReviewModal.jsx';

const CLASS_COLOR = {
  possible: 'var(--text-dim)',
  likely: 'var(--amber)',
  high_confidence: 'var(--red)',
};

export default function AlertFeed({ alerts, onReview }) {
  const [reviewingAlert, setReviewingAlert] = useState(null);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>ALERT FEED</div>
      <div style={styles.list}>
        {alerts.length === 0 && <div style={styles.empty}>No alerts yet. Spotter devices are watching.</div>}
        {alerts.map((a) => (
          <div key={a.alert_id} style={styles.item} onClick={() => setReviewingAlert(a)}>
            <div style={styles.itemTop}>
              <span style={{ ...styles.classDot, background: CLASS_COLOR[a.classification] || 'var(--text-dim)' }} />
              <span style={styles.name}>{a.full_name}</span>
              <span style={styles.time}>{timeAgo(a.reported_at)}</span>
            </div>
            <div style={styles.meta}>
              {a.classification?.replace('_', ' ')} · {(a.confidence * 100).toFixed(1)}% ·{' '}
              {a.latitude ? `${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}` : 'no GPS'}
            </div>
            <div style={styles.actionsRow}>
              {(a.has_matched_frame || a.has_enrollment_photo) && (
                <span style={styles.reviewHint}>tap to review images</span>
              )}
              {a.reviewed && <span style={styles.reviewedTag}>REVIEWED</span>}
            </div>
          </div>
        ))}
      </div>

      {reviewingAlert && (
        <MatchReviewModal
          alert={reviewingAlert}
          onClose={() => setReviewingAlert(null)}
          onConfirmReviewed={onReview}
        />
      )}
    </div>
  );
}

function timeAgo(unixSeconds) {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: {
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, color: 'var(--text-dim)',
    padding: '14px 14px 10px',
  },
  list: { overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { color: 'var(--text-mute)', fontSize: 12, padding: 20, textAlign: 'center' },
  item: { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', cursor: 'pointer' },
  itemTop: { display: 'flex', alignItems: 'center', gap: 8 },
  classDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  name: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, flex: 1 },
  time: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)' },
  meta: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 4 },
  actionsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  reviewHint: { fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 0.5 },
  reviewedTag: { fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mute)', letterSpacing: 0.5 },
};
