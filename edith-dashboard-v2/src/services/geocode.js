/**
 * Reverse geocoding via OpenStreetMap's free Nominatim API — no key
 * required. Used only for the spoken match announcement's location name,
 * so a slow or failed lookup should never block anything else; callers
 * get null back on any failure/timeout and fall back to announcing
 * without a place name.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT_MS = 4000;

export async function reverseGeocode(latitude, longitude) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${NOMINATIM_URL}?lat=${latitude}&lon=${longitude}&format=json&zoom=14&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const addr = data.address || {};
    // Prefer a neighbourhood/suburb-level name over a full street address —
    // shorter and more natural to hear spoken aloud.
    const place = addr.suburb || addr.neighbourhood || addr.town || addr.city_district
      || addr.city || addr.county || null;
    const region = addr.state || addr.county || null;

    if (place && region && place !== region) return `${place}, ${region}`;
    return place || region || null;
  } catch {
    return null; // timeout, offline, or API error — caller falls back gracefully
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Forward geocoding — turns a typed place name into a list of candidate
 * locations (name + coordinates), for the "type a location, pick the
 * right one, see it on the map" geofence workflow. Empty array on any
 * failure/timeout rather than throwing, so a flaky lookup just shows
 * "no results" instead of breaking the UI.
 */
export async function searchLocations(query) {
  if (!query || query.trim().length < 2) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return [];

    const data = await res.json();
    return data.map((item) => ({
      label: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
