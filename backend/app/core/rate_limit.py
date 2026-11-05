"""In-memory rate limiter for authentication endpoints and abuse prevention."""
import time
from collections import defaultdict
from typing import Dict, List
from fastapi import HTTPException, status


class InMemoryRateLimiter:
    """Sliding-window rate limiter keyed by client identifier (e.g. IP)."""

    def __init__(self, max_requests: int, window_seconds: int, detail: str = "Too many requests. Please slow down."):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.detail = detail
        self._history: Dict[str, List[float]] = defaultdict(list)

    def check(self, key: str) -> None:
        """Record attempt and raise HTTP 429 if limit exceeded within window."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        # Evict timestamps outside the window
        valid = [t for t in self._history[key] if t > cutoff]
        if len(valid) >= self.max_requests:
            retry_after = int(self.window_seconds - (now - valid[0])) + 1
            self._history[key] = valid
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"{self.detail} Retry after {max(1, retry_after)} seconds.",
                headers={"Retry-After": str(max(1, retry_after))}
            )
        valid.append(now)
        self._history[key] = valid

    def reset(self) -> None:
        """Clear all rate limit history (useful in test teardown)."""
        self._history.clear()


# Pre-configured rate limiters
# 10 login attempts per IP per 60 seconds
login_limiter = InMemoryRateLimiter(max_requests=10, window_seconds=60, detail="Too many failed or rapid login attempts.")
# 5 registrations per IP per 300 seconds
registration_limiter = InMemoryRateLimiter(max_requests=5, window_seconds=300, detail="Registration rate limit exceeded.")

