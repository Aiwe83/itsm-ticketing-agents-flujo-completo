"""X-Request-Id, equivalente a src/middlewares/logger.middleware.ts (requestIdMiddleware).

La cabecera de entrada se lee siempre en minuscula (x-request-id) y NO es
configurable (a diferencia de la cabecera de API key, que si lo es via
API_KEY_HEADER). Si no llega, se genera un UUID; siempre se devuelve en la
respuesta.
"""

from __future__ import annotations

import uuid

REQUEST_ID_HEADER = "X-Request-Id"
_REQUEST_ID_HEADER_LOWER = "x-request-id"


def resolve_request_id(headers: dict[str, str]) -> str:
    existing = headers.get(_REQUEST_ID_HEADER_LOWER)
    if existing:
        return existing
    return str(uuid.uuid4())
