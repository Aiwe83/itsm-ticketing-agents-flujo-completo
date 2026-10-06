from api.routers.agent import agent_router
from api.routers.health import system_router
from api.routers.mcp import mcp_router
from api.routers.orchestrator import orchestrator_router
from api.routers.provider import provider_router

__all__ = [
    "agent_router",
    "mcp_router",
    "orchestrator_router",
    "provider_router",
    "system_router",
]
