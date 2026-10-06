from dishka.integrations.litestar import DishkaRouter

from api.controllers.agent import AgentChatController, AgentController
from core.settings import API_V1_PREFIX

agent_router = DishkaRouter(
    path=API_V1_PREFIX,
    route_handlers=[AgentController, AgentChatController],
)

__all__ = ["agent_router"]
