from dishka.integrations.litestar import DishkaRouter

from core.settings import API_V1_PREFIX
from api.controllers.provider import ProviderController

provider_router = DishkaRouter(path=API_V1_PREFIX, route_handlers=[ProviderController])

__all__ = ["provider_router"]

