"""Errores de aplicacion, equivalente reducido de src/errors/index.ts + error.middleware.ts.

Se preserva el contrato OBSERVABLE (status code, forma del envelope de error,
mensaje unico de 401) sin portar 1:1 la taxonomia completa de codigos Zod del
TS original (esa parte nunca formo parte del contrato que hay que preservar
segun el plan de migracion; aqui se simplifica a un solo AppError parametrizado).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from litestar import Request, Response
from litestar.exceptions import HTTPException


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        code: str = "INTERNAL_ERROR",
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.details = details

    @classmethod
    def unauthorized(cls, message: str = "Unauthorized access", details: Any = None) -> "AppError":
        return cls(401, message, "UNAUTHORIZED", details)

    @classmethod
    def validation(cls, message: str, details: Any = None) -> "AppError":
        return cls(400, message, "VALIDATION_ERROR", details)

    @classmethod
    def not_found(cls, message: str = "Resource not found", details: Any = None) -> "AppError":
        return cls(404, message, "NOT_FOUND", details)

    @classmethod
    def internal(cls, message: str = "Internal server error", details: Any = None) -> "AppError":
        return cls(500, message, "INTERNAL_ERROR", details)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def app_error_handler(request: Request, exc: AppError) -> Response:
    request_id = request.headers.get("x-request-id")
    body: dict[str, Any] = {
        "success": False,
        "error": {
            "message": exc.message,
            "code": exc.code,
            "statusCode": exc.status_code,
            "timestamp": _now_iso(),
            "path": request.url.path,
        },
    }
    if request_id:
        body["error"]["requestId"] = request_id
    if exc.details is not None:
        body["error"]["details"] = exc.details
    return Response(content=body, status_code=exc.status_code)


def http_exception_handler(request: Request, exc: HTTPException) -> Response:
    request_id = request.headers.get("x-request-id")
    body: dict[str, Any] = {
        "success": False,
        "error": {
            "message": exc.detail,
            "code": "INTERNAL_ERROR" if exc.status_code >= 500 else "VALIDATION_ERROR",
            "statusCode": exc.status_code,
            "timestamp": _now_iso(),
            "path": request.url.path,
        },
    }
    if request_id:
        body["error"]["requestId"] = request_id
    return Response(content=body, status_code=exc.status_code)


def unhandled_exception_handler(request: Request, exc: Exception) -> Response:
    request_id = request.headers.get("x-request-id")
    body: dict[str, Any] = {
        "success": False,
        "error": {
            "message": "Internal Server Error",
            "code": "INTERNAL_ERROR",
            "statusCode": 500,
            "timestamp": _now_iso(),
            "path": request.url.path,
        },
    }
    if request_id:
        body["error"]["requestId"] = request_id
    return Response(content=body, status_code=500)
