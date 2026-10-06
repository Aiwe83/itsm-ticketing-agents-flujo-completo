from __future__ import annotations

from datetime import datetime
from typing import Any, TypedDict

import msgspec
from bson import ObjectId
from msgspec import UNSET, UnsetType

from models.model import LLMModel


class DBProvider(TypedDict, total=False):
    _id: ObjectId | str
    name: str
    description: str | None
    base_url: str | None
    metadata: dict[str, Any] | None
    enabled: bool
    created_at: datetime
    last_modified_at: datetime


class Provider(msgspec.Struct, frozen=True):
    id: str
    name: str
    description: str | None = None
    base_url: str | None = None
    metadata: dict[str, Any] | None = None
    enabled: bool = True
    models: tuple[LLMModel, ...] = ()
    created_at: datetime | None = None
    last_modified_at: datetime | None = None


class CreateProviderPayload(msgspec.Struct, frozen=True):
    name: str
    description: str | None = None
    base_url: str | None = None
    metadata: dict[str, Any] | None = None
    enabled: bool = True


class UpdateProviderPayload(msgspec.Struct, frozen=True):
    name: str | UnsetType = UNSET
    description: str | None | UnsetType = UNSET
    base_url: str | None | UnsetType = UNSET
    metadata: dict[str, Any] | None | UnsetType = UNSET
    enabled: bool | UnsetType = UNSET
