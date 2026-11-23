export default function TopBar({ user, activeDeviceCount, systemOnline, onOpenCctv, onLogout }) {
  return (
    <header style={styles.bar}>
      <div style={styles.left}>
        <div style={styles.mark}>E</div>
        <div>
          <div style={styles.title}>EDITH // COMMAND CONSOLE</div>
          <div style={styles.sub}>Embedded Detective &amp; Intelligent Tracking Hub</div>
        </div>
      </div>

      <div style={styles.center}>
        <Stat label="SYSTEM" value={systemOnline ? 'ONLINE' : 'OFFLINE'} color={systemOnline ? 'var(--cyan)' : 'var(--red)'} />
        <Stat label="SPOTTER DEVICES" value={activeDeviceCount} color="var(--violet)" />
      </div>

      <div style={styles.right}>
        <button style={styles.cctvBtn} onClick={onOpenCctv}>
          <CameraIcon /> CAMERA NETWORKS
        </button>
        <div style={styles.user}>
          <div style={styles.userName}>{user?.username || user?.display_name}</div>
          <div style={styles.userRole}>{(user?.role || 'guardian').toUpperCase()}</div>
        </div>
        <button style={styles.logout} onClick={onLogout}>LOG OUT</button>
      </div>
    </header>
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

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

const styles = {
  bar: {
    height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', borderBottom: '1px solid var(--line)', background: 'var(--panel)',
  },
  left: { display: 'flex', alignItems: 'center', gap: 12 },
  mark: {
    width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-display)', fontWeight: 700,
    color: 'var(--base)', background: 'linear-gradient(135deg, var(--cyan), var(--violet))',
  },
  title: { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, letterSpacing: 1 },
  sub: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' },
  center: { display: 'flex', gap: 28 },
  right: { display: 'flex', alignItems: 'center', gap: 14 },
  cctvBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
    padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
  },
  user: { textAlign: 'right' },
  userName: { fontSize: 13, fontWeight: 500 },
  userRole: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)' },
  logout: {
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
    padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
  },
};
