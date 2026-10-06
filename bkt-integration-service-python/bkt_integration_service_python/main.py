"""Bootstrap de la app, equivalente a src/server.ts + src/app.ts."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from dishka.integrations.litestar import DishkaRouter, setup_dishka
from litestar import Litestar
from litestar.exceptions import HTTPException

from bkt_integration_service_python.api.routes.health import health
from bkt_integration_service_python.api.routes.issues import create_issues
from bkt_integration_service_python.core.config import get_settings
from bkt_integration_service_python.core.di import build_container
from bkt_integration_service_python.core.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
)
from bkt_integration_service_python.core.logging import configure_logging, logger
from bkt_integration_service_python.repositories.mongo.connection import MongoConnection


@asynccontextmanager
async def _lifespan(app: Litestar) -> AsyncGenerator[None, None]:
    container = app.state.dishka_container
    mongo = await container.get(MongoConnection)
    await mongo.ensure_indexes()
    logger.info("bkt-integration-service ready")
    yield


def create_app() -> Litestar:
    settings = get_settings()
    configure_logging(settings)

    router = DishkaRouter(path="", route_handlers=[health, create_issues])

    app = Litestar(
        route_handlers=[router],
        exception_handlers={
            AppError: app_error_handler,
            HTTPException: http_exception_handler,
            Exception: unhandled_exception_handler,
        },
        lifespan=[_lifespan],
    )
    container = build_container()
    setup_dishka(container, app)
    return app


app = create_app()
