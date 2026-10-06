from __future__ import annotations

from typing import Self

import msgspec

from models.mcp import (
    CreateMCPPayload as CreateMCPPayloadModel,
    MCP as MCPModel,
    UpdateMCPPayload as UpdateMCPPayloadModel,
)


class MCPResponse(MCPModel, frozen=True):
    @classmethod
    def from_model(cls, model: MCPModel) -> Self:
        return cls(**msgspec.to_builtins(model))


class CreateMCPRequest(CreateMCPPayloadModel, frozen=True):
    """HTTP request schema for creating an MCP server."""


class UpdateMCPRequest(UpdateMCPPayloadModel, frozen=True):
    """HTTP request schema for updating an MCP server."""


__all__ = [
    "CreateMCPRequest",
    "MCPResponse",
    "UpdateMCPRequest",
]
