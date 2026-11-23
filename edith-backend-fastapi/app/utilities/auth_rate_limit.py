"""
Login rate limiting. Tracks failed attempts per (username, client IP) pair
in memory and locks out further attempts for a cooldown window once a
threshold is hit — a login endpoint with no limit at all is an open door
to brute-forcing passwords, especially against a known default account
name like "admin".

In-memory, same trade-off as the other rate limiter in this codebase:
correct and effective for a single-process deployment; a multi-instance
deployment would move this to Redis so the counters are shared.
"""

import time
import threading

from fastapi import HTTPException, status

MAX_FAILURES = 5
LOCKOUT_SECONDS = 300  # 5 minutes
FAILURE_WINDOW_SECONDS = 300  # failures older than this don't count toward the threshold

_lock = threading.Lock()
_failures: dict[str, list[float]] = {}
_locked_until: dict[str, float] = {}


def _key(username: str, client_ip: str) -> str:
    # Keyed on username+IP rather than just username so one attacker can't
    # lock out a real user by deliberately failing their login from
    # elsewhere, and rather than just IP so many accounts behind one NAT/
    # office network don't get lumped into a single counter.
    return f"{username.lower()}:{client_ip}"


def check_lockout(username: str, client_ip: str):
    key = _key(username, client_ip)
    with _lock:
        locked_until = _locked_until.get(key)
        if locked_until and time.time() < locked_until:
            remaining = int(locked_until - time.time())
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Try again in {remaining}s.",
            )


def register_failure(username: str, client_ip: str):
    key = _key(username, client_ip)
    now = time.time()
    with _lock:
        attempts = [t for t in _failures.get(key, []) if now - t < FAILURE_WINDOW_SECONDS]
        attempts.append(now)
        _failures[key] = attempts
        if len(attempts) >= MAX_FAILURES:
            _locked_until[key] = now + LOCKOUT_SECONDS


def register_success(username: str, client_ip: str):
    key = _key(username, client_ip)
    with _lock:
        _failures.pop(key, None)
        _locked_until.pop(key, None)
