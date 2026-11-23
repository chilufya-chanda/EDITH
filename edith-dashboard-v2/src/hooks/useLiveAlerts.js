import { useState, useEffect, useCallback, useRef } from 'react';
import { api, subscribeToAlerts } from '../services/api.js';
import { announceMatch } from '../services/alertSound.js';
import { reverseGeocode } from '../services/geocode.js';

export function useLiveAlerts(enabled) {
  const [alerts, setAlerts] = useState([]);
  const seenIds = useRef(new Set());

  const addAlert = useCallback((alert) => {
    if (seenIds.current.has(alert.alert_id)) return;
    seenIds.current.add(alert.alert_id);
    setAlerts((prev) => [alert, ...prev]);

    // Every alert that arrives here via the live SSE push is already a
    // real match (no-match/no-face results are never broadcast) — this
    // is deliberately NOT triggered for the initial historical fetch on
    // page load, only for genuinely new matches happening right now.
    if (alert.latitude && alert.longitude) {
      reverseGeocode(alert.latitude, alert.longitude).then((place) => {
        announceMatch(alert.full_name, place);
      });
    } else {
      announceMatch(alert.full_name, null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let closeSSE = () => {};

    (async () => {
      try {
        const initial = await api.liveAlerts();
        initial.forEach((a) => seenIds.current.add(a.alert_id));
        setAlerts(initial);
      } catch {
        // fall through — SSE may still connect even if the initial fetch failed
      }
      closeSSE = subscribeToAlerts(addAlert);
    })();

    return () => closeSSE();
  }, [enabled, addAlert]);

  const review = useCallback(async (alertId) => {
    await api.reviewAlert(alertId);
    setAlerts((prev) => prev.map((a) => (a.alert_id === alertId ? { ...a, reviewed: true } : a)));
  }, []);

  return { alerts, review };
}
