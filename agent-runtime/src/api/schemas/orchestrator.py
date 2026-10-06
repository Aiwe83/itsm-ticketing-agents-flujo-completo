from __future__ import annotations

from typing import Self

import msgspec

from models.orchestrator import (
    OrchestratorDispatchPayload as OrchestratorDispatchPayloadModel,
    OrchestratorDispatchResponse as OrchestratorDispatchResponseModel,
)


class OrchestratorDispatchRequest(OrchestratorDispatchPayloadModel, frozen=True):
    """HTTP request schema for integration-service dispatch calls."""


class OrchestratorDispatchResponse(OrchestratorDispatchResponseModel, frozen=True):
    """HTTP response schema for orchestrator dispatch calls."""

    @classmethod
    def from_model(cls, model: OrchestratorDispatchResponseModel) -> Self:
        return cls(**msgspec.to_builtins(model))


__all__ = [
    "OrchestratorDispatchRequest",
    "OrchestratorDispatchResponse",
]
