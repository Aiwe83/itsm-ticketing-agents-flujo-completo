from __future__ import annotations

from core.settings import AppSettings
from models.health import HealthReport
from repositories.health import HealthRepository
from services.base import BaseService


class HealthService(BaseService):
    def __init__(self, settings: AppSettings, repository: HealthRepository) -> None:
        self._settings = settings
        self._repository = repository

    async def get_health(self) -> HealthReport:
        dependencies = await self._repository.get_dependencies()
        return HealthReport(
            status="ok",
            service=self._settings.app_name,
            version=self._settings.app_version,
            environment=self._settings.environment,
            dependencies=dependencies,
        )
