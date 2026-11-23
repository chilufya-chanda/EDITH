import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';

const POLL_MS = 5000;

export function useActiveDevices(enabled) {
  const [count, setCount] = useState(0);
  const [devices, setDevices] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const result = await api.activeDevices();
      setCount(result.count);
      setDevices(result.devices);
    } catch {
      // A failed poll here shouldn't disrupt the rest of the dashboard —
      // systemOnline (from useCases) already surfaces backend connectivity issues.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { count, devices };
}
