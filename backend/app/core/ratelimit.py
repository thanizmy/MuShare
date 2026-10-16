import math
import time
from collections import deque
from collections.abc import Callable
from functools import lru_cache

from app.core.config import get_settings

_MAX_TRACKED_KEYS = 10_000


class AttemptLimiter:
    """Sliding-window limiter for failed attempts, keyed by an arbitrary string.

    State lives in this process's memory, which is right for a single instance. Running
    several API instances means each keeps its own counts, so a shared store (e.g. Redis)
    would be needed to enforce the limit globally.
    """

    def __init__(
        self,
        max_attempts: int,
        window_seconds: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_attempts = max_attempts
        self.window = window_seconds
        self._clock = clock
        self._attempts: dict[str, deque[float]] = {}

    def _prune(self, key: str, now: float) -> deque[float]:
        attempts = self._attempts.get(key)
        if attempts is None:
            return deque()
        while attempts and now - attempts[0] >= self.window:
            attempts.popleft()
        if not attempts:
            del self._attempts[key]
        return attempts

    def retry_after(self, key: str) -> int:
        """Seconds until another attempt is allowed; 0 when it already is."""
        now = self._clock()
        attempts = self._prune(key, now)
        if len(attempts) < self.max_attempts:
            return 0
        return max(1, math.ceil(attempts[0] + self.window - now))

    def record(self, key: str) -> None:
        now = self._clock()
        if len(self._attempts) >= _MAX_TRACKED_KEYS:
            for stale in list(self._attempts):
                self._prune(stale, now)
        self._attempts.setdefault(key, deque()).append(now)

    def reset(self, key: str) -> None:
        self._attempts.pop(key, None)

    def clear(self) -> None:
        self._attempts.clear()


class LoginLimits:
    """Two layers: per (IP, email) so one account can't be brute-forced, and per IP so one
    client can't spray many accounts."""

    def __init__(self, per_account: AttemptLimiter, per_ip: AttemptLimiter) -> None:
        self.per_account = per_account
        self.per_ip = per_ip

    @staticmethod
    def _keys(ip: str, email: str) -> tuple[str, str]:
        return f"{ip}|{email.strip().lower()}", ip

    def retry_after(self, ip: str, email: str) -> int:
        account_key, ip_key = self._keys(ip, email)
        return max(self.per_account.retry_after(account_key), self.per_ip.retry_after(ip_key))

    def record_failure(self, ip: str, email: str) -> None:
        account_key, ip_key = self._keys(ip, email)
        self.per_account.record(account_key)
        self.per_ip.record(ip_key)

    def record_success(self, ip: str, email: str) -> None:
        self.per_account.reset(self._keys(ip, email)[0])

    def clear(self) -> None:
        self.per_account.clear()
        self.per_ip.clear()


@lru_cache
def get_login_limits() -> LoginLimits:
    s = get_settings()
    window = s.login_rate_limit_window_seconds
    return LoginLimits(
        per_account=AttemptLimiter(s.login_rate_limit_attempts, window),
        # Generous enough for a shared office or school network.
        per_ip=AttemptLimiter(s.login_rate_limit_attempts * 6, window),
    )


@lru_cache
def get_upload_limiter() -> AttemptLimiter:
    """Caps how often one person can start an upload, successful or not."""
    return AttemptLimiter(get_settings().studio_uploads_per_hour, 3600)
