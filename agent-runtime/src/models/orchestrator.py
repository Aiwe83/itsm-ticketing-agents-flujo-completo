from __future__ import annotations

from typing import Any

import msgspec

from models.openai_compatible.responses.output import ResponsesResponsePayload


class OrchestratorDispatchPayload(msgspec.Struct, frozen=True, kw_only=True):
    rol: str
    ticket_id: str
    mesh_id: str
    execution_id: str
    ticket_context: dict[str, Any] | None = None


class OrchestratorDispatchResponse(msgspec.Struct, frozen=True, kw_only=True):
    success: bool
    agent_id: str
    agent_name: str
    ticket_id: str
    mesh_id: str
    execution_id: str
    chat_id: str
    model: str
    response: ResponsesResponsePayload
    metadata: dict[str, Any]


__all__ = [
    "OrchestratorDispatchPayload",
    "OrchestratorDispatchResponse",
]
