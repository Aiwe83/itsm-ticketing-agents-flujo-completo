from __future__ import annotations

from typing import Any

from litestar import status_codes

from core.errors.base import ApplicationError


class MCPConfigError(ApplicationError):
    """Raised when an MCP server has invalid or missing configuration."""

    status_code = status_codes.HTTP_422_UNPROCESSABLE_ENTITY
    code = "mcp_config_error"
    message = "MCP server configuration error."

    def __init__(
        self,
        message: str | None = None,
        *,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, extra=extra)


class MCPConnectionError(ApplicationError):
    """Raised when the agent cannot load tools from one or more MCP servers."""

    status_code = status_codes.HTTP_502_BAD_GATEWAY
    code = "mcp_connection_error"
    message = "Unable to connect to MCP server."

    def __init__(
        self,
        message: str | None = None,
        *,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message=message, extra=extra)
