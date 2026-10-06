from __future__ import annotations

from collections.abc import Sequence

from dishka import FromDishka
from litestar import post

from api.controllers.base import BaseController
from api.schemas.orchestrator import (
    OrchestratorDispatchRequest,
    OrchestratorDispatchResponse,
)
from core.logger import get_request_id
from services.orchestrator import OrchestratorDispatchService


class OrchestratorDispatchController(BaseController):
    path: str = "/orchestrator"
    tags: Sequence[str] | None = ("orchestrator",)

    @post(
        path="/dispatch",
        operation_id="DispatchOrchestratorTicket",
        status_code=200,
        summary="Dispatch an integration-service ticket to an agent",
    )
    async def dispatch_ticket(
        self,
        data: OrchestratorDispatchRequest,
        orchestrator_service: FromDishka[OrchestratorDispatchService],
    ) -> OrchestratorDispatchResponse:
        result = await orchestrator_service.dispatch(
            data,
            request_id=get_request_id(),
        )
        return OrchestratorDispatchResponse.from_model(result)
