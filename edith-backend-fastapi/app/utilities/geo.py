"""
Great-circle distance between two lat/lon points (Haversine formula).
Used only for case geofencing — deciding whether a spotter device's
reported position falls within a case's configured search radius.
"""

import math

EARTH_RADIUS_METERS = 6_371_000


def distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(a))


def within_geofence(case: dict, device_lat: float, device_lon: float) -> bool:
    """
    True if the case has no geofence configured (search everywhere — the
    default/original behaviour), or if the device's position is within
    the case's configured radius.
    """
    if case.get("geofence_lat") is None or case.get("geofence_radius_meters") is None:
        return True
    if device_lat is None or device_lon is None:
        # Case IS geofenced but this device didn't report a location —
        # can't confirm it's in scope, so exclude it rather than guess.
        return False
    d = distance_meters(case["geofence_lat"], case["geofence_lon"], device_lat, device_lon)
    return d <= case["geofence_radius_meters"]
