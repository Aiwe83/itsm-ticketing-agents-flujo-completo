from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

from dishka.integrations.litestar import setup_dishka
from litestar import Litestar
from litestar.exceptions import HTTPException
from litestar.middleware import DefineMiddleware
from litestar.types import ASGIApp, ControllerRouterHandler, ExceptionHandlersMap, Middleware

from api.routers import (
    agent_router,
    mcp_router,
    orchestrator_router,
    provider_router,
    system_router,
)
from core.di import build_async_container
from core.errors import default_exception_handler, http_exception_handler
from core.logger import configure_logging
from core.middleware import RequestContextMiddleware
from core.settings import AppSettings, get_settings
from core.state import get_app_state
from core.telemetry import configure_telemetry, shutdown_telemetry


@asynccontextmanager
async def app_lifespan(app: Litestar) -> AsyncIterator[None]:
    container = get_app_state(app).dishka_container
    try:
        yield
    finally:
        await container.close()
        shutdown_telemetry()


def _build_otel_middleware(app: ASGIApp) -> ASGIApp:
    from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware

    return cast(ASGIApp, OpenTelemetryMiddleware(app))


def create_app(settings: AppSettings | None = None) -> Litestar:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings)
    configure_telemetry(resolved_settings)

    container = build_async_container(resolved_settings)

    middleware: list[Middleware] = []
    middleware.append(DefineMiddleware(_build_otel_middleware))
    middleware.append(RequestContextMiddleware())

    exception_handlers = cast(
        ExceptionHandlersMap,
        {
            HTTPException: http_exception_handler,
            Exception: default_exception_handler,
        },
    )
    route_handlers: list[ControllerRouterHandler] = [
        system_router,
        provider_router,
        mcp_router,
        agent_router,
        orchestrator_router,
    ]

    app = Litestar(
        debug=resolved_settings.server.debug,
        route_handlers=route_handlers,
        middleware=middleware,
        lifespan=[app_lifespan],
        exception_handlers=exception_handlers,
        openapi_config=None,
    )
    setup_dishka(container, app)
    return app
