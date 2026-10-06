from __future__ import annotations

from datetime import datetime
from typing import TypedDict

import msgspec
from bson import ObjectId
from msgspec import UNSET, UnsetType

class DBModel(TypedDict, total=False):
    _id: ObjectId | str
    name: str               # display name
    description: str | None
    provider: str
    model_id: str           # stable identifier referenced by templates.models[]
    enabled: bool
    created_at: datetime
    last_modified_at: datetime


class LLMModel(msgspec.Struct, frozen=True):
    id: str
    name: str
    provider: str
    model_id: str
    description: str | None = None
    enabled: bool = True
    created_at: datetime | None = None
    last_modified_at: datetime | None = None


class CreateModelPayload(msgspec.Struct, frozen=True):
    name: str
    provider: str
    model_id: str
    description: str | None = None
    enabled: bool = True


class UpdateModelPayload(msgspec.Struct, frozen=True):
    name: str | UnsetType = UNSET
    description: str | None | UnsetType = UNSET
    provider: str | UnsetType = UNSET
    model_id: str | UnsetType = UNSET
    enabled: bool | UnsetType = UNSET


class UpdateModelProviderPayload(msgspec.Struct, frozen=True):
    provider: str
