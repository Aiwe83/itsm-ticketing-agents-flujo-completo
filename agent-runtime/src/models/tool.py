from __future__ import annotations

from datetime import datetime
from typing import Literal, TypedDict

import msgspec
from msgspec import UNSET, UnsetType
from bson import ObjectId


class DBTool(TypedDict, total=False):
    _id: ObjectId | str
    name: str
    description: str | None
    category: str | None
    source_type: Literal["internal", "mcp"]
    source_ref: str | None
    enabled: bool
    created_at: datetime
    last_modified_at: datetime


class Tool(msgspec.Struct, frozen=True):
    id: str
    name: str
    description: str | None = None
    category: str | None = None
    source_type: Literal["internal", "mcp"] = "internal"
    source_ref: str | None = None
    enabled: bool = True
    created_at: datetime | None = None
    last_modified_at: datetime | None = None


class CreateToolPayload(msgspec.Struct, frozen=True):
    name: str
    description: str | None = None
    category: str | None = None
    source_type: Literal["internal", "mcp"] = "internal"
    source_ref: str | None = None
    enabled: bool = True


class UpdateToolPayload(msgspec.Struct, frozen=True):
    name: str | UnsetType = UNSET
    description: str | None | UnsetType = UNSET
    category: str | None | UnsetType = UNSET
    source_type: Literal["internal", "mcp"] | UnsetType = UNSET
    source_ref: str | None | UnsetType = UNSET
    enabled: bool | UnsetType = UNSET


class UpdateToolDescriptionPayload(msgspec.Struct, frozen=True):
    description: str | None = None


class UpdateToolCategoryPayload(msgspec.Struct, frozen=True):
    category: str | None = None


class UpdateToolEnabledPayload(msgspec.Struct, frozen=True):
    enabled: bool
