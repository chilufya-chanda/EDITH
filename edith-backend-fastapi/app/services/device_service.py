"""
Tracks which spotter devices have been heard from recently. Previously
the dashboard's "active devices" count was derived only from past
alerts — which meant a device that was running fine but simply hadn't
matched anyone yet showed up as 0 connected devices, even while it was
actively polling the backend every few seconds. This tracks real
heartbeats instead: any hit on GET /api/cases/active (which every
spotter device polls on a timer regardless of whether it's found a
match) with a device_uuid counts as "this device is alive right now."

In-memory, same trade-off as the other trackers in this codebase —
correct for a single-process deployment.
"""

import time
import threading

_HEARTBEAT_WINDOW_SECONDS = 30  # a device not heard from in this long is considered offline
_lock = threading.Lock()
_last_seen: dict[str, float] = {}


def record_heartbeat(device_uuid: str):
    if not device_uuid:
        return
    with _lock:
        _last_seen[device_uuid] = time.time()


def get_active_devices() -> list[dict]:
    cutoff = time.time() - _HEARTBEAT_WINDOW_SECONDS
    with _lock:
        return [
            {"device_uuid": uuid, "last_seen": ts}
            for uuid, ts in _last_seen.items()
            if ts > cutoff
        ]


def get_active_device_count() -> int:
    return len(get_active_devices())
