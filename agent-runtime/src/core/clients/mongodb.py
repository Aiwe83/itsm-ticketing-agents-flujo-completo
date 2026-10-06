from __future__ import annotations

from pymongo import AsyncMongoClient

from core.clients.base import BaseClient
from core.settings import MongoDBSettings
from models.health import DependencyHealth


class MongoDBClient(BaseClient):
    name = "mongodb"
    kind = "database"

    def __init__(self, settings: MongoDBSettings) -> None:
        self._settings = settings
        self._client = (
            AsyncMongoClient(
                settings.dsn,
                serverSelectionTimeoutMS=settings.server_selection_timeout_ms,
            )
            if settings.configured
            else None
        )

    @property
    def configured(self) -> bool:
        return self._settings.configured

    @property
    def client(self) -> AsyncMongoClient | None:
        return self._client

    async def healthcheck(self) -> DependencyHealth:
        status = "configured" if self.configured else "not_configured"
        detail = "MongoDB client initialized." if self.configured else "MongoDB DSN missing."
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
            await self._client.close()
