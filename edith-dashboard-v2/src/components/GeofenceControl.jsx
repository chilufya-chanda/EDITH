import { useState, useRef, useEffect } from 'react';
import { api } from '../services/api.js';
import { searchLocations } from '../services/geocode.js';

const PRESETS = [
  { label: '500m', meters: 500 },
  { label: '2km', meters: 2000 },
  { label: '10km', meters: 10000 },
  { label: '50km', meters: 50000 },
];

export default function GeofenceControl({ caseData, onUpdated, onPreview }) {
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState(
    caseData.geofence_lat != null ? { lat: caseData.geofence_lat, lon: caseData.geofence_lon } : null
  );
  const [label, setLabel] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [radius, setRadius] = useState(caseData.geofence_radius_meters || 2000);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  const hasGeofence = caseData.geofence_lat != null;

  // Live-preview on the map as the admin picks a location/radius, even
  // before saving — this is what makes it feel intelligent rather than
  // just a form: type "Lusaka", see it appear on the map immediately.
  useEffect(() => {
    if (open && coords) onPreview({ lat: coords.lat, lon: coords.lon, radiusMeters: radius });
    return () => { if (open) onPreview(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coords, radius]);

  function handleQueryChange(value) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchLocations(value);
      setSuggestions(results);
      setSearching(false);
    }, 400); // debounced so we're not hitting the geocoder on every keystroke
  }

  function pickSuggestion(s) {
    setCoords({ lat: s.lat, lon: s.lon });
    setLabel(s.label.split(',')[0]);
    setQuery(s.label.split(',')[0]);
    setSuggestions([]);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLabel('current location');
        setQuery('');
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function apply() {
    if (!coords) return;
    setSaving(true);
    try {
      await api.setGeofence(caseData.case_id, coords.lat, coords.lon, radius);
      onPreview(null);
      onUpdated();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      await api.clearGeofence(caseData.case_id);
      setCoords(null);
      onPreview(null);
      onUpdated();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.wrap} onClick={(e) => e.stopPropagation()}>
      <button style={styles.toggle} onClick={() => setOpen((o) => !o)}>
        <RadiusIcon />
        {hasGeofence
          ? `SEARCHING WITHIN ${formatRadius(caseData.geofence_radius_meters)}`
          : 'SEARCHING EVERYWHERE'}
      </button>

      {open && (
        <div style={styles.panel}>
          <div style={styles.searchWrap}>
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Type a location — e.g. Lusaka"
              style={styles.searchInput}
            />
            {searching && <div style={styles.searchStatus}>Searching…</div>}
            {suggestions.length > 0 && (
              <div style={styles.suggestions}>
                {suggestions.map((s, i) => (
                  <button key={i} style={styles.suggestionItem} onClick={() => pickSuggestion(s)}>
                    <PinIcon />
                    <span style={styles.suggestionLabel}>{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button style={styles.locationBtn} onClick={useCurrentLocation} disabled={locating}>
            <TargetIcon />
            {locating ? 'LOCATING…' : 'OR USE MY CURRENT LOCATION'}
          </button>

          {coords && (
            <div style={styles.centerConfirm}>
              Center: {label || 'selected point'} ({coords.lat.toFixed(3)}, {coords.lon.toFixed(3)})
            </div>
          )}

          <div style={styles.presetRow}>
            {PRESETS.map((p) => (
              <button
                key={p.meters}
                style={{ ...styles.presetBtn, ...(radius === p.meters ? styles.presetBtnActive : {}) }}
                onClick={() => setRadius(p.meters)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={styles.panelActions}>
            {hasGeofence && (
              <button style={styles.clearBtn} onClick={clear} disabled={saving}>
                CLEAR — SEARCH EVERYWHERE
              </button>
            )}
            <button style={styles.applyBtn} onClick={apply} disabled={!coords || saving}>
              {saving ? 'SAVING…' : hasGeofence ? 'WIDEN / UPDATE' : 'APPLY RADIUS'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRadius(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 1)}km` : `${meters}m`;
}

function RadiusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.3" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

const styles = {
  wrap: { marginTop: 8 },
  toggle: {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 0.5, padding: '6px 8px',
  },
  panel: {
    marginTop: 8, padding: 10, background: 'var(--base-soft)', border: '1px solid var(--line)',
    borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: 10,
  },
  searchWrap: { position: 'relative' },
  searchInput: {
    width: '100%', background: 'var(--base)', border: '1px solid var(--line)', color: 'var(--text)',
    padding: '8px 10px', fontFamily: 'var(--font-body)', fontSize: 12,
  },
  searchStatus: { fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mute)', marginTop: 4 },
  suggestions: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
  },
  suggestionItem: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
    background: 'transparent', border: 'none', borderRadius: 0, color: 'var(--cyan)',
    padding: '8px 10px', fontFamily: 'var(--font-body)', fontSize: 11, borderBottom: '1px solid var(--line)',
  },
  suggestionLabel: { color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  locationBtn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
    border: '1px solid var(--line)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
    fontSize: 9, letterSpacing: 0.5, padding: '7px 8px',
  },
  centerConfirm: {
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', padding: '4px 2px',
  },
  presetRow: { display: 'flex', gap: 6 },
  presetBtn: {
    flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)', fontSize: 10, padding: '6px 0',
  },
  presetBtnActive: { background: 'var(--cyan)', color: 'var(--base)', fontWeight: 700, borderColor: 'var(--cyan)' },
  panelActions: { display: 'flex', gap: 8 },
  clearBtn: {
    flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-mute)',
    fontFamily: 'var(--font-mono)', fontSize: 9, padding: '7px 0',
  },
  applyBtn: {
    flex: 1, background: 'var(--cyan)', border: 'none', color: 'var(--base)',
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: 0.5, padding: '7px 0',
  },
};
