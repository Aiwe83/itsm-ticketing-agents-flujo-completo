from dishka.integrations.litestar import DishkaRouter

from api.controllers.orchestrator import OrchestratorDispatchController
from core.settings import API_V1_PREFIX

orchestrator_router = DishkaRouter(
    path=API_V1_PREFIX,
    route_handlers=[OrchestratorDispatchController],
)

__all__ = ["orchestrator_router"]
