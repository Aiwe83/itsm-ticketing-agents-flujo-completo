from __future__ import annotations

from abc import ABC, abstractmethod

from models.health import DependencyHealth


class BaseClient(ABC):
    """Base class for external infrastructure clients."""

    name: str
    kind: str

    @property
    @abstractmethod
    def configured(self) -> bool:
        """Return whether the client has enough configuration to be usable."""

    @abstractmethod
    async def healthcheck(self) -> DependencyHealth:
        """Return the current health snapshot for the client."""

    async def aclose(self) -> None:
        """Close held resources."""
