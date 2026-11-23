import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';

const REFRESH_INTERVAL_MS = 8000; // case status changes far less often than alerts

export function useCases(enabled) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [systemOnline, setSystemOnline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listCases();
      setCases(data);
      setSystemOnline(true);
    } catch {
      setSystemOnline(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const activate = useCallback(async (caseId) => {
    await api.activateCase(caseId);
    await refresh();
  }, [refresh]);

  const expire = useCallback(async (caseId, reason = 'found') => {
    await api.expireCase(caseId, reason);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (caseId) => {
    await api.deleteCase(caseId);
    await refresh();
  }, [refresh]);

  return { cases, loading, systemOnline, refresh, activate, expire, remove };
}
