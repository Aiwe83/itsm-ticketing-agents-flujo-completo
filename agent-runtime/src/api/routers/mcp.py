from dishka.integrations.litestar import DishkaRouter

from core.settings import API_V1_PREFIX
from api.controllers.mcp import MCPController

mcp_router = DishkaRouter(path=API_V1_PREFIX, route_handlers=[MCPController])

__all__ = ["mcp_router"]

