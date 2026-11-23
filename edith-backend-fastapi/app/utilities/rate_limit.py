"""
Per-device cooldown so a spotter phone sending frames rapidly doesn't
hammer the face-matching model with redundant work. In-memory — fine for a
single-process deployment; a multi-instance deployment would move this to
Redis, but that's a scaling concern for after the competition, not before.
"""

import time
import threading

from app.config import get_settings

settings = get_settings()
_last_seen: dict[str, float] = {}
_lock = threading.Lock()


def is_on_cooldown(device_uuid: str) -> tuple[bool, float]:
    now = time.time()
    with _lock:
        last = _last_seen.get(device_uuid, 0)
        remaining = settings.REPORT_COOLDOWN_SECONDS - (now - last)
        if remaining > 0:
            return True, round(remaining, 2)
        _last_seen[device_uuid] = now
        return False, 0.0
