from __future__ import annotations

from typing import Self

import msgspec

from models.provider import (
    CreateProviderPayload as CreateProviderPayloadModel,
    Provider as ProviderModel,
    UpdateProviderPayload as UpdateProviderPayloadModel,
)


class ProviderResponse(ProviderModel, frozen=True):
    @classmethod
    def from_model(cls, model: ProviderModel) -> Self:
        return cls(**msgspec.to_builtins(model))


class CreateProviderRequest(CreateProviderPayloadModel, frozen=True):
    """HTTP request schema for creating a provider."""


class UpdateProviderRequest(UpdateProviderPayloadModel, frozen=True):
    """HTTP request schema for updating a provider."""


__all__ = [
    "CreateProviderRequest",
    "ProviderResponse",
    "UpdateProviderRequest",
]
