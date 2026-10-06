from __future__ import annotations

from redis.asyncio import Redis

from core.clients.base import BaseClient
from core.settings import RedisSettings
from models.health import DependencyHealth


class RedisClient(BaseClient):
    name = "redis"
    kind = "cache"

    def __init__(self, settings: RedisSettings) -> None:
        self._settings = settings
        self._client = (
            Redis.from_url(
                settings.url,
                socket_timeout=settings.socket_timeout_seconds,
                health_check_interval=settings.healthcheck_interval_seconds,
                decode_responses=False,
            )
            if settings.configured and settings.url is not None
            else None
        )

    @property
    def configured(self) -> bool:
        return self._settings.configured

    @property
    def client(self) -> Redis | None:
        return self._client

    def prefixed(self, raw_key: str) -> str:
        prefix = self._settings.key_prefix.strip(":")
        key = raw_key.strip(":")
        if not prefix:
            return key
        if not key:
            return prefix
        return f"{prefix}:{key}"

    def build_key(self, *parts: str) -> str:
        cleaned = [part.strip(":") for part in parts if part and part.strip(":")]
        return self.prefixed(":".join(cleaned))

    async def healthcheck(self) -> DependencyHealth:
        status = "configured" if self.configured else "not_configured"
        detail = "Redis client initialized." if self.configured else "Redis URL missing."
        return DependencyHealth(
            name=self.name,
            kind=self.kind,
            status=status,
            configured=self.configured,
            healthy=None,
            detail=detail,
        )

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
