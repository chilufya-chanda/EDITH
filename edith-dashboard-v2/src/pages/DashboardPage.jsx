import { useState } from 'react';
import TopBar from '../components/TopBar.jsx';
import CaseList from '../components/CaseList.jsx';
import MapView from '../components/MapView.jsx';
import AlertFeed from '../components/AlertFeed.jsx';
import EnrollModal from '../components/EnrollModal.jsx';
import CctvIntegrationsModal from '../components/CctvIntegrationsModal.jsx';
import { useCases } from '../hooks/useCases.js';
import { useLiveAlerts } from '../hooks/useLiveAlerts.js';
import { useActiveDevices } from '../hooks/useActiveDevices.js';

export default function DashboardPage({ user, onLogout }) {
  const [showEnroll, setShowEnroll] = useState(false);
  const [showCctv, setShowCctv] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [geoPreview, setGeoPreview] = useState(null); // { lat, lon, radiusMeters } | null — live preview while setting a geofence

  const { cases, systemOnline, refresh, activate, expire, remove } = useCases(true);
  const { alerts, review } = useLiveAlerts(true);
  const { count: activeDeviceCount } = useActiveDevices(true);

  return (
    <div style={styles.shell}>
      <TopBar
        user={user}
        systemOnline={systemOnline}
        activeDeviceCount={activeDeviceCount}
        onOpenCctv={() => setShowCctv(true)}
        onLogout={onLogout}
      />
      <div style={styles.body}>
        <aside style={styles.leftRail}>
          <CaseList
            cases={cases}
            selectedCaseId={selectedCaseId}
            onSelect={setSelectedCaseId}
            onActivate={activate}
            onExpire={expire}
            onDelete={remove}
            onNewCase={() => setShowEnroll(true)}
            onCaseUpdated={refresh}
            onGeofencePreview={setGeoPreview}
          />
        </aside>

        <main style={styles.map}>
          <MapView alerts={alerts} cases={cases} geoPreview={geoPreview} />
        </main>

        <aside style={styles.rightRail}>
          <AlertFeed alerts={alerts} onReview={review} />
        </aside>
      </div>

      {showEnroll && (
        <EnrollModal
          onClose={() => setShowEnroll(false)}
          onEnrolled={() => { setShowEnroll(false); refresh(); }}
        />
      )}

      {showCctv && <CctvIntegrationsModal onClose={() => setShowCctv(false)} />}
    </div>
  );
}

const styles = {
  shell: { height: '100vh', display: 'flex', flexDirection: 'column' },
  body: { flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr 320px', minHeight: 0 },
  leftRail: { borderRight: '1px solid var(--line)', background: 'var(--panel)', minHeight: 0 },
  rightRail: { borderLeft: '1px solid var(--line)', background: 'var(--panel)', minHeight: 0 },
  map: { minHeight: 0 },
};
