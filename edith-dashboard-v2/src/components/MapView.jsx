import { useMemo, useRef, useState, useEffect, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';

// Esri World Imagery — free, no API key. Shown completely natural, no
// filter — real satellite imagery with buildings/streets visible normally.
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// CARTO dark basemap, recolored into an electric-blue glow (see
// index.css .street-layer) — tuned deliberately so the map stays clearly
// legible, not just dark.
const STREET_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

// Continental default view — centered on Africa, zoomed out to the whole
// continent rather than one country/region. Zooms in to street level
// only once an alert actually fires or a geofence preview is set.
const DEFAULT_CENTER = [1.5, 20];
const DEFAULT_ZOOM = 3;
const FLY_TO_ZOOM = 15;

const TRAIL_PALETTE = ['#42d9ff', '#8B5CF6', '#F2A83C', '#34D399', '#F472B6'];

function colorForCase(caseId) {
  let hash = 0;
  for (let i = 0; i < caseId.length; i++) hash = (hash * 31 + caseId.charCodeAt(i)) >>> 0;
  return TRAIL_PALETTE[hash % TRAIL_PALETTE.length];
}

/** Rough zoom level that keeps a given radius comfortably in view. */
function zoomForRadius(radiusMeters) {
  if (radiusMeters <= 1000) return 14;
  if (radiusMeters <= 5000) return 12;
  if (radiusMeters <= 20000) return 10;
  if (radiusMeters <= 75000) return 8;
  return 6;
}

function pulseIcon(color, big = false) {
  const size = big ? 16 : 9;
  const html = renderToStaticMarkup(
    <div style={{ position: 'relative', width: size, height: size }}>
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: color,
          animation: 'pulse-ring 1.6s cubic-bezier(0.2,0.6,0.4,1) infinite',
        }}
      />
      <div style={{ position: 'absolute', inset: size * 0.22, borderRadius: '50%', background: color, boxShadow: `0 0 ${big ? 14 : 8}px ${color}` }} />
    </div>
  );
  return L.divIcon({ html, className: 'edith-pin', iconSize: [size, size] });
}

/** Lives inside MapContainer — owns the actual Leaflet map instance for fly-to and resize handling. */
function MapController({ alerts, fullscreen, geoPreview }) {
  const map = useMap();
  const lastFlownAlertId = useRef(null);
  const lastPreviewKey = useRef(null);

  // Fly to the newest alert exactly once per new alert.
  const newest = alerts[0];
  if (newest && newest.alert_id !== lastFlownAlertId.current && newest.latitude && newest.longitude) {
    lastFlownAlertId.current = newest.alert_id;
    map.flyTo([newest.latitude, newest.longitude], FLY_TO_ZOOM, { duration: 2.2 });
  }

  // Fly to a geofence preview the moment it's set (or changes location) —
  // this is what makes typing "Lusaka" and seeing the map actually jump
  // there feel intelligent rather than just filling in a form.
  if (geoPreview) {
    const key = `${geoPreview.lat},${geoPreview.lon},${geoPreview.radiusMeters}`;
    if (key !== lastPreviewKey.current) {
      lastPreviewKey.current = key;
      map.flyTo([geoPreview.lat, geoPreview.lon], zoomForRadius(geoPreview.radiusMeters), { duration: 1.4 });
    }
  } else {
    lastPreviewKey.current = null;
  }

  // Toggling fullscreen changes the map container's actual DOM size via
  // CSS, and Leaflet caches its size internally — without this explicit
  // nudge, the map renders with stale/misaligned bounds until something
  // else forces a relayout.
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(id);
  }, [fullscreen, map]);

  return null;
}

export default function MapView({ alerts, cases = [], geoPreview = null }) {
  const [mode, setMode] = useState('satellite'); // 'satellite' | 'street'
  const [fullscreen, setFullscreen] = useState(false);
  const geoAlerts = useMemo(() => alerts.filter((a) => a.latitude && a.longitude), [alerts]);

  const geofencedCases = useMemo(
    () => cases.filter((c) => c.status === 'active' && c.geofence_lat != null),
    [cases]
  );

  // Group every sighting by case — this is what turns "device A saw them
  // here, device B saw them there" into a single connected trail,
  // regardless of which device reported which point.
  const trails = useMemo(() => {
    const byCase = new Map();
    for (const a of geoAlerts) {
      if (!byCase.has(a.case_id)) byCase.set(a.case_id, []);
      byCase.get(a.case_id).push(a);
    }
    return Array.from(byCase.entries()).map(([caseId, points]) => ({
      caseId,
      fullName: points[0].full_name,
      color: colorForCase(caseId),
      points: points.slice().sort((a, b) => a.reported_at - b.reported_at),
    }));
  }, [geoAlerts]);

  const uniqueDevices = new Set(geoAlerts.map((a) => a.device_uuid)).size;
  const trailsWithMovement = trails.filter((t) => t.points.length > 1).length;

  return (
    <div className={fullscreen ? 'map-fullscreen' : undefined} style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        minZoom={2}
        style={{ height: '100%', width: '100%', background: 'var(--base)' }}
        zoomControl={false}
        worldCopyJump
      >
        <ZoomControl position="bottomright" />

        {mode === 'satellite' ? (
          <TileLayer url={SATELLITE_TILES} attribution="&copy; Esri" maxZoom={19} />
        ) : (
          <TileLayer url={STREET_TILES} className="street-layer" attribution="&copy; OpenStreetMap &copy; CARTO" maxZoom={20} />
        )}

        <MapController alerts={geoAlerts} fullscreen={fullscreen} geoPreview={geoPreview} />

        {/* Saved search-radius coverage areas — one glowing circle per
            geofenced active case, so "we're only searching within 10km
            of downtown" is something you can literally see and zoom
            around, not just a number in a form. */}
        {geofencedCases.map((c) => (
          <Circle
            key={c.case_id}
            center={[c.geofence_lat, c.geofence_lon]}
            radius={c.geofence_radius_meters}
            className="geofence-circle"
            pathOptions={{ color: '#42d9ff', weight: 2, fillColor: '#42d9ff', fillOpacity: 0.08 }}
          >
            <Popup>
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                <div><strong>{c.full_name}</strong> — search coverage</div>
                <div>{(c.geofence_radius_meters / 1000).toFixed(1)}km radius</div>
              </div>
            </Popup>
          </Circle>
        ))}

        {/* Live preview circle while an admin is picking a location/radius
            before saving — dashed and violet, distinct from a saved
            (solid cyan) geofence. */}
        {geoPreview && (
          <Circle
            center={[geoPreview.lat, geoPreview.lon]}
            radius={geoPreview.radiusMeters}
            pathOptions={{ color: '#8B5CF6', weight: 2, dashArray: '6 6', fillColor: '#8B5CF6', fillOpacity: 0.06 }}
          />
        )}

        {trails.map((trail) => {
          const positions = trail.points.map((p) => [p.latitude, p.longitude]);
          const latest = trail.points[trail.points.length - 1];
          return (
            <Fragment key={trail.caseId}>
              {positions.length > 1 && (
                <>
                  <Polyline positions={positions} pathOptions={{ color: trail.color, weight: 7, opacity: 0.22 }} />
                  <Polyline positions={positions} pathOptions={{ color: trail.color, weight: 2, opacity: 0.9, dashArray: '1 8' }} />
                </>
              )}
              {trail.points.map((p, i) => {
                const isLatest = p.alert_id === latest.alert_id;
                return (
                  <Marker
                    key={p.alert_id}
                    position={[p.latitude, p.longitude]}
                    icon={pulseIcon(p.classification === 'high_confidence' ? '#EF4444' : trail.color, isLatest)}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        <div><strong>{p.full_name}</strong></div>
                        <div>{p.case_id}</div>
                        <div>device: {p.device_uuid}</div>
                        <div>confidence: {(p.confidence * 100).toFixed(1)}%</div>
                        <div>{new Date(p.reported_at * 1000).toLocaleString()}</div>
                        {trail.points.length > 1 && <div>sighting {i + 1} of {trail.points.length} in this trail</div>}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </Fragment>
          );
        })}
      </MapContainer>

      {mode === 'street' && <div className="radar-sweep" aria-hidden="true" />}

      <div style={overlayStyles.label}>LIVE SIGHTING MAP</div>

      <div style={overlayStyles.toggle}>
        <button
          onClick={() => setMode('satellite')}
          style={{ ...overlayStyles.toggleBtn, ...(mode === 'satellite' ? overlayStyles.toggleBtnActive : {}) }}
        >
          SATELLITE
        </button>
        <button
          onClick={() => setMode('street')}
          style={{ ...overlayStyles.toggleBtn, ...(mode === 'street' ? overlayStyles.toggleBtnActive : {}) }}
        >
          STREET
        </button>
      </div>

      <button
        onClick={() => setFullscreen((f) => !f)}
        style={overlayStyles.fullscreenBtn}
        title={fullscreen ? 'Exit full screen' : 'Full screen'}
      >
        {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
      </button>

      <div style={overlayStyles.statsPanel}>
        <Stat label="SIGHTINGS" value={geoAlerts.length} />
        <Stat label="TRAILS" value={trailsWithMovement} />
        <Stat label="DEVICES" value={uniqueDevices} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--cyan)', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function FullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
function ExitFullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

const overlayStyles = {
  label: {
    position: 'absolute', top: 12, left: 12, zIndex: 1000,
    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
    padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 11,
    letterSpacing: 1.5, color: 'var(--cyan)',
  },
  toggle: {
    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
    display: 'flex', border: '1px solid var(--line)', background: 'var(--panel)',
    borderRadius: 'var(--radius-sm)', overflow: 'hidden',
  },
  toggleBtn: {
    background: 'transparent', border: 'none', borderRadius: 0, color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5,
    padding: '8px 16px', cursor: 'pointer',
  },
  toggleBtnActive: {
    background: 'var(--cyan)', color: 'var(--base)', fontWeight: 700,
  },
  fullscreenBtn: {
    position: 'absolute', top: 12, right: 12, zIndex: 1000,
    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', color: 'var(--cyan)',
    padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  statsPanel: {
    position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
    padding: '8px 14px', display: 'flex', gap: 18,
  },
};
