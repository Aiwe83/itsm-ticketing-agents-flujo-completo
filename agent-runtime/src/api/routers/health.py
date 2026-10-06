from dishka.integrations.litestar import DishkaRouter

from core.settings import API_V1_PREFIX
from api.controllers.health import HealthController

system_router = DishkaRouter(path=API_V1_PREFIX, route_handlers=[HealthController])

__all__ = ["system_router"]

