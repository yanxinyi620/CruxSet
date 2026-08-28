import time


class LoginRateLimiter:
    """Small in-process guard for credential stuffing on the administrator login."""

    def __init__(self, attempts: int = 5, window_seconds: int = 15 * 60) -> None:
        self._attempts = attempts
        self._window_seconds = window_seconds
        self._failures: dict[str, list[float]] = {}

    def is_limited(self, key: str) -> bool:
        self._prune(key)
        return len(self._failures.get(key, [])) >= self._attempts

    def register_failure(self, key: str) -> None:
        self._prune(key)
        self._failures.setdefault(key, []).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)

    def _prune(self, key: str) -> None:
        earliest = time.monotonic() - self._window_seconds
        remaining = [stamp for stamp in self._failures.get(key, []) if stamp >= earliest]
        if remaining:
            self._failures[key] = remaining
        else:
            self._failures.pop(key, None)
