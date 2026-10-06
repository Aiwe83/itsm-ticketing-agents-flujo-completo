"""Comparacion de API key, equivalente a src/middlewares/auth.middleware.ts.

Mismo diseno que el TS original: se hashea SHA-256 ambos lados antes de comparar
(para que hmac.compare_digest siempre reciba dos buffers de 32 bytes -> una
cabecera de longitud distinta nunca corta la comparacion antes de tiempo) y se
devuelve SIEMPRE el mismo mensaje de error tanto si falta la cabecera como si
la clave no coincide, para no filtrar cual de los dos casos ocurrio.
"""

from __future__ import annotations

import hashlib
import hmac

UNAUTHORIZED_MESSAGE = "Missing or invalid API key"


def _digest(value: str) -> bytes:
    return hashlib.sha256(value.encode("utf-8")).digest()


def is_valid_api_key(provided: str | None, expected: str) -> bool:
    if not provided:
        return False
    return hmac.compare_digest(_digest(provided), _digest(expected))
