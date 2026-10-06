from __future__ import annotations

from collections.abc import Iterable

from core.clients.base import BaseClient
from models.health import DependencyHealth
from repositories.base import BaseRepository


class HealthRepository(BaseRepository):
    def __init__(self, clients: Iterable[BaseClient]) -> None:
        self._clients = tuple(clients)

    async def get_dependencies(self) -> tuple[DependencyHealth, ...]:
        return tuple([await client.healthcheck() for client in self._clients])
