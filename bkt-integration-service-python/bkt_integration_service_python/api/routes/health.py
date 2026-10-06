"""GET /health, equivalente a router.get(env.HEALTH_CHECK_PATH, ...) en src/routes/index.ts.

Publica (fuera de la autenticacion por API key). 200 si Mongo esta conectado,
503 si no.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any

from dishka.integrations.litestar import FromDishka, inject
from litestar import Response, get

from bkt_integration_service_python.core.config import Settings, get_settings
from bkt_integration_service_python.repositories.mongo.connection import MongoConnection

_START_TIME = time.monotonic()


# La ruta se lee de HEALTH_CHECK_PATH en tiempo de definicion (equivalente a
# `router.get(env.HEALTH_CHECK_PATH, ...)` en src/routes/index.ts), no via DI:
# el path de una ruta Litestar se fija al registrarla, antes de que exista
# cualquier scope de inyeccion por-request.
@get(path=get_settings().health_check_path)
@inject
async def health(settings: FromDishka[Settings], mongo: FromDishka[MongoConnection]) -> Response[dict[str, Any]]:
    connected = await mongo.is_connected()
    body = {
        "uptime": time.monotonic() - _START_TIME,
        "message": "OK",
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "environment": settings.node_env,
        "database": "connected" if connected else "disconnected",
    }
    return Response(content=body, status_code=200 if connected else 503)
