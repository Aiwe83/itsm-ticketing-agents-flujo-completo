from __future__ import annotations

from typing import Self

import msgspec

from models.agent import (
    Agent as AgentModel,
    CreateAgentPayload as CreateAgentPayloadModel,
    UpdateAgentPayload as UpdateAgentPayloadModel,
)


class CreateAgentRequest(CreateAgentPayloadModel, frozen=True):
    """HTTP request schema for creating an agent."""


class UpdateAgentRequest(UpdateAgentPayloadModel, frozen=True):
    """HTTP request schema for updating an agent."""


class AgentResponse(AgentModel, frozen=True):
    """HTTP response schema for agent endpoints."""

    @classmethod
    def from_model(cls, model: AgentModel) -> Self:
        return cls(**msgspec.to_builtins(model))


__all__ = [
    "AgentResponse",
    "CreateAgentRequest",
    "UpdateAgentRequest",
]
