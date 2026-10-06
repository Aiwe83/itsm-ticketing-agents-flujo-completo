from dishka import FromDishka
from litestar import get

from api.controllers.base import BaseController
from api.schemas.health import HealthResponse
from core.logger import get_request_id
from services.health import HealthService


class HealthController(BaseController):
    path = ""
    tags = ["system"]

    @get(path="/health", operation_id="GetHealth")
    async def get_health(self, health_service: FromDishka[HealthService]) -> HealthResponse:
        report = await health_service.get_health()
        return HealthResponse(
            status=report.status,
            service=report.service,
            version=report.version,
            environment=report.environment,
            dependencies=report.dependencies,
            request_id=get_request_id(),
        )
