from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Optional

import httpx

from collector.config import Settings

logger = logging.getLogger(__name__)

_RETRY_STATUS = {429, 500, 502, 503, 504}
_BLOCK_MARKERS = ("captcha", "too many requests", "príliš veľa požiadaviek", "access denied", "request blocked")


class FetchError(Exception):
    pass


class Fetcher:
    """
    Polite concurrent HTTP client: bounded concurrency, a minimum gap between
    request starts, and retries with exponential backoff on transient failures.
    """

    def __init__(self, settings: Settings, client: Optional[httpx.AsyncClient] = None):
        self.settings = settings
        self._client = client
        self._own_client = client is None
        self._sem = asyncio.Semaphore(max(1, settings.http_concurrency))
        self._gap_lock = asyncio.Lock()
        self._last_start = 0.0
        self.requests_made = 0

    async def __aenter__(self) -> Fetcher:
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={
                    "User-Agent": self.settings.user_agent,
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "sk,en;q=0.8",
                },
                timeout=self.settings.http_timeout,
                follow_redirects=True,
                limits=httpx.Limits(max_connections=self.settings.http_concurrency * 2),
            )
        return self

    async def __aexit__(self, *exc) -> None:
        if self._own_client and self._client is not None:
            await self._client.aclose()

    async def _wait_gap(self) -> None:
        async with self._gap_lock:
            wait = self._last_start + self.settings.http_min_delay - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_start = time.monotonic()

    async def get_text(self, url: str) -> str:
        assert self._client is not None, "use 'async with Fetcher(...)'"
        attempts = self.settings.http_retries + 1
        last_error = "unknown error"
        async with self._sem:
            for attempt in range(1, attempts + 1):
                await self._wait_gap()
                self.requests_made += 1
                try:
                    resp = await self._client.get(url)
                    if resp.status_code in _RETRY_STATUS:
                        last_error = f"HTTP {resp.status_code}"
                    elif resp.status_code >= 400:
                        raise FetchError(f"HTTP {resp.status_code} for {url}")
                    else:
                        text = resp.text
                        low = text[:20000].lower()
                        if any(m in low for m in _BLOCK_MARKERS) and "dynamictable" not in low:
                            last_error = "blocked/throttled response"
                        else:
                            return text
                except httpx.TimeoutException:
                    last_error = "timeout"
                except httpx.TransportError as e:
                    last_error = f"connection error: {e.__class__.__name__}"

                if attempt < attempts:
                    backoff = min(30.0, 2 ** attempt) + random.uniform(0, 1)
                    logger.info("Retry %d/%d for %s in %.1fs (%s)", attempt, attempts - 1, url, backoff, last_error)
                    await asyncio.sleep(backoff)
        raise FetchError(f"{last_error} after {attempts} attempts")
