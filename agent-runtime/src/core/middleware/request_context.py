from __future__ import annotations

import time
from typing import Final

from litestar.datastructures import MutableScopeHeaders
from litestar.enums import ScopeType
from litestar.middleware import ASGIMiddleware
from litestar.types import ASGIApp, Message, Receive, Scope, Send

from core.logger import bind_request_id, get_logger, reset_request_id

REQUEST_ID_HEADER: Final[str] = "X-Request-ID"


class RequestContextMiddleware(ASGIMiddleware):
    """Attach a request id to the log context and response headers."""

    scopes = (ScopeType.HTTP,)

    async def handle(self, scope: Scope, receive: Receive, send: Send, next_app: ASGIApp) -> None:
        headers = {key.decode().lower(): value.decode() for key, value in scope.get("headers", [])}
        request_id, token = bind_request_id(headers.get(REQUEST_ID_HEADER.lower()))
        start = time.monotonic()
        status_code = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                response_headers = MutableScopeHeaders.from_message(message=message)
                response_headers[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await next_app(scope, receive, send_wrapper)
        finally:
            elapsed_ms = round((time.monotonic() - start) * 1000, 2)
            get_logger().bind(
                method=scope.get("method", "GET"),
                path=scope.get("path", ""),
                status_code=status_code,
                duration_ms=elapsed_ms,
            ).info("request completed")
            reset_request_id(token)
