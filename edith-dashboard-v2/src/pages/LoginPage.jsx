import { useState } from 'react';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError('Access denied. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.grid} aria-hidden="true" />
      <form onSubmit={handleSubmit} className="scan-frame" style={styles.card}>

        <div style={styles.brand}>
          <div style={styles.brandMark}>E</div>
          <div>
            <div style={styles.brandName}>EDITH</div>
            <div style={styles.brandSub}>COMMAND CONSOLE</div>
          </div>
        </div>

        <label style={styles.label}>Officer / Admin ID</label>
        <input
          style={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
        />

        <label style={styles.label}>Passphrase</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div style={styles.error}>{error}</div>}

        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'AUTHENTICATING…' : 'AUTHENTICATE'}
        </button>

        <div style={styles.footer}>
          Access restricted to authorised officer &amp; admin accounts. Every
          session is written to the audit log.
        </div>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    height: '100vh',
    display: 'grid',
    placeItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.04) 1px, transparent 1px)',
    backgroundSize: '42px 42px',
    maskImage: 'radial-gradient(circle at center, black 0%, transparent 75%)',
  },
  card: {
    width: 380,
    padding: '36px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    zIndex: 1,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  brandMark: {
    width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
    color: 'var(--base)', background: 'linear-gradient(135deg, var(--cyan), var(--violet))',
  },
  brandName: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: 2 },
  brandSub: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: 2 },
  label: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 12, letterSpacing: 1 },
  input: {
    background: 'var(--base)', border: '1px solid var(--line)', color: 'var(--text)',
    padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 14, marginTop: 4,
  },
  button: {
    marginTop: 22, padding: '12px', background: 'var(--cyan)', border: 'none',
    color: 'var(--base)', fontFamily: 'var(--font-display)', fontWeight: 600,
    letterSpacing: 2, fontSize: 13,
  },
  error: { color: 'var(--red)', fontSize: 12, marginTop: 10, fontFamily: 'var(--font-mono)' },
  footer: { marginTop: 18, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 },
};
