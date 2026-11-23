// EDITH FastAPI backend API client.
// Reads the backend URL from an env var so the same build can point at
// localhost during development and your real deployed server in production.
// Set VITE_EDITH_API_URL in a .env file (see .env.example).

const BASE_URL = import.meta.env.VITE_EDITH_API_URL || 'http://localhost:8000';

function authHeaders() {
  const token = localStorage.getItem('edith_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * A saved token can go stale — the backend restarted with a new signing
 * secret, the token expired, or it was issued by a different backend
 * entirely. Previously that just made every request silently fail,
 * leaving the app sitting in a half-logged-in state with no visible way
 * back to the login screen. Now any 401 clears the stale session and
 * reloads, which naturally lands back on the login screen since
 * useAuth() finds nothing valid in storage.
 */
function handleUnauthorized() {
  localStorage.removeItem('edith_token');
  localStorage.removeItem('edith_user');
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...authHeaders(),
    ...(options.headers || {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && path !== '/api/auth/login') {
    handleUnauthorized();
    throw new Error('Session expired — signing out.');
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} ${detail}`);
  }
  const contentType = res.headers.get('content-type') || '';
  return contentType.includes('application/json') ? res.json() : res.text();
}

export const api = {
  login: (username, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  listCases: () => request('/api/cases'),
  getCase: (caseId) => request(`/api/cases/${caseId}`),
  activeCases: () => request('/api/cases/active'),

  createCase: (formData) =>
    request('/api/register', {
      method: 'POST',
      body: formData,
    }),
  activateCase: (caseId, expiresInHours = 72) =>
    request('/api/enroll/activate', {
      method: 'POST',
      body: JSON.stringify({ case_id: caseId, expires_in_hours: expiresInHours }),
    }),
  expireCase: (caseId, reason = 'found') =>
    request(`/api/enroll/${caseId}/expire`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    }),
  deleteCase: (caseId, reason = 'erasure_requested') =>
    request('/api/delete-user', {
      method: 'POST',
      body: JSON.stringify({ case_id: caseId, reason }),
    }),

  liveAlerts: (since = 0) => request(`/api/alerts/live?since=${since}`),
  activeDevices: () => request('/api/devices/active'),
  reviewAlert: (alertId) =>
    request(`/api/alerts/${alertId}/review`, { method: 'PUT' }),

  setGeofence: (caseId, lat, lon, radiusMeters) =>
    request(`/api/cases/${caseId}/geofence`, {
      method: 'PUT',
      body: JSON.stringify({ lat, lon, radius_meters: radiusMeters }),
    }),
  clearGeofence: (caseId) =>
    request(`/api/cases/${caseId}/geofence`, {
      method: 'PUT',
      body: JSON.stringify({ lat: null, lon: null, radius_meters: null }),
    }),

  health: () => request('/api/health'),
};

/**
 * Fetches an image endpoint that requires auth (so it can't be used as a
 * plain <img src="...">, since <img> tags can't send an Authorization
 * header) and returns a local object URL instead. Caller is responsible
 * for calling URL.revokeObjectURL() on it when done (see the
 * MatchReviewModal component) to avoid leaking memory.
 */
async function fetchImageAsObjectUrl(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { ...authHeaders() } });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('Session expired — signing out.');
  }
  if (!res.ok) return null; // 404 (no photo on file) is expected/common, not an error to surface
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function getCasePhotoUrl(caseId) {
  return fetchImageAsObjectUrl(`/api/cases/${caseId}/photo`);
}

export function getAlertFrameUrl(alertId) {
  return fetchImageAsObjectUrl(`/api/alerts/${alertId}/frame`);
}

/**
 * Opens a live Server-Sent Events connection so new alerts arrive the
 * instant they're recorded, instead of waiting for the next poll.
 * Deliberately built on fetch()+ReadableStream rather than the browser's
 * EventSource API: EventSource can't set an Authorization header, which
 * would force the auth token into the URL — and URLs end up in server
 * access logs and browser history. This way the token travels the same
 * way it does on every other request. Returns a close() function.
 */
export function subscribeToAlerts(onAlert, onError) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/alerts/stream`, {
        headers: { ...authHeaders() },
        signal: controller.signal,
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok || !res.body) throw new Error(`stream failed: HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; each frame's payload
        // line looks like "data: {...}".
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue; // heartbeat/comment frame
          try {
            onAlert(JSON.parse(line.slice(6)));
          } catch {
            // ignore malformed frame
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err);
    }
  })();

  return () => controller.abort();
}

export { BASE_URL };
