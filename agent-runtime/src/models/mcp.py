from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, TypedDict

import msgspec
from bson import ObjectId
from msgspec import UNSET, UnsetType


MCPAuthType = Literal["free", "static_headers"]
MCPTransport = Literal["sse", "streamable_http", "http"]
MCPTransportInput = Literal["sse", "streamable_http", "http"]
MCPTransportOutput = Literal["sse", "http"]


class DBMCPToolSnapshot(TypedDict, total=False):
    name: str
    title: str | None
    description: str | None
    input_schema: dict[str, Any] | None
    output_schema: dict[str, Any] | None
    annotations: dict[str, Any] | None
    meta: dict[str, Any] | None


class DBMCPPromptSnapshot(TypedDict, total=False):
    name: str
    title: str | None
    description: str | None
    arguments: list[dict[str, Any]]
    meta: dict[str, Any] | None


class DBMCPResourceSnapshot(TypedDict, total=False):
    name: str | None
    title: str | None
    uri: str
    description: str | None
    mime_type: str | None
    size: int | None
    annotations: dict[str, Any] | None
    meta: dict[str, Any] | None


class DBMCPResourceTemplateSnapshot(TypedDict, total=False):
    name: str
    title: str | None
    uri_template: str
    description: str | None
    mime_type: str | None
    annotations: dict[str, Any] | None
    meta: dict[str, Any] | None


class DBMCPServer(TypedDict, total=False):
    _id: ObjectId | str
    name: str
    description: str | None
    account: str | None
    auth_type: MCPAuthType
    transport: Literal["sse", "streamable_http", "http"]
    url: str
    enabled: bool
    headers_encrypted: str | None
    timeout: float | None
    sse_read_timeout: float | None
    allowed_tool_names: list[str]
    tool_argument_defaults: dict[str, dict[str, Any]]
    tools: list[DBMCPToolSnapshot]
    prompts: list[DBMCPPromptSnapshot]
    resources: list[DBMCPResourceSnapshot]
    resource_templates: list[DBMCPResourceTemplateSnapshot]
    catalog_last_refreshed_at: datetime | None
    catalog_refresh_error: str | None
    created_at: datetime
    last_modified_at: datetime


class MCPRuntimeAuth(TypedDict, total=False):
    type: Literal["bearer", "headers"]
    token: str
    headers: dict[str, str]


class MCPConnectionSpec(TypedDict, total=False):
    transport: Literal["sse", "streamable_http"]
    url: str
    headers: dict[str, str]
    timeout: float
    sse_read_timeout: float


class MCPToolSnapshot(msgspec.Struct, frozen=True):
    name: str
    title: str | None = None
    description: str | None = None
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None
    annotations: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None


class MCPPromptSnapshot(msgspec.Struct, frozen=True):
    name: str
    title: str | None = None
    description: str | None = None
    arguments: tuple[dict[str, Any], ...] = ()
    meta: dict[str, Any] | None = None


class MCPResourceSnapshot(msgspec.Struct, frozen=True):
    uri: str
    name: str | None = None
    title: str | None = None
    description: str | None = None
    mime_type: str | None = None
    size: int | None = None
    annotations: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None


class MCPResourceTemplateSnapshot(msgspec.Struct, frozen=True):
    name: str
    uri_template: str
    title: str | None = None
    description: str | None = None
    mime_type: str | None = None
    annotations: dict[str, Any] | None = None
    meta: dict[str, Any] | None = None


class MCP(msgspec.Struct, frozen=True):
    id: str
    name: str
    description: str | None = None
    auth_type: MCPAuthType = "free"
    transport: MCPTransportOutput = "http"
    endpoint: str | None = None
    account: str | None = None
    enabled: bool = True
    timeout: float | None = None
    sse_read_timeout: float | None = None
    has_static_headers: bool = False
    static_header_names: tuple[str, ...] = ()
    allowed_tool_names: tuple[str, ...] = ()
    tool_argument_defaults: dict[str, dict[str, Any]] = msgspec.field(default_factory=dict)
    tools: tuple[MCPToolSnapshot, ...] = ()
    prompts: tuple[MCPPromptSnapshot, ...] = ()
    resources: tuple[MCPResourceSnapshot, ...] = ()
    resource_templates: tuple[MCPResourceTemplateSnapshot, ...] = ()
    catalog_last_refreshed_at: datetime | None = None
    catalog_refresh_error: str | None = None


class CreateMCPPayload(msgspec.Struct, frozen=True):
    name: str
    description: str | None = None
    auth_type: MCPAuthType = "free"
    transport: MCPTransportInput = "http"
    endpoint: str | None = None
    account: str | None = None
    enabled: bool = True
    timeout: float | None = None
    sse_read_timeout: float | None = None
    static_headers: dict[str, str] | None = None
    allowed_tool_names: tuple[str, ...] = ()
    tool_argument_defaults: dict[str, dict[str, Any]] = msgspec.field(default_factory=dict)


class UpdateMCPPayload(msgspec.Struct, frozen=True):
    name: str | None | UnsetType = UNSET
    description: str | None | UnsetType = UNSET
    auth_type: MCPAuthType | UnsetType = UNSET
    transport: MCPTransportInput | UnsetType = UNSET
    endpoint: str | None | UnsetType = UNSET
    account: str | None | UnsetType = UNSET
    enabled: bool | UnsetType = UNSET
    timeout: float | None | UnsetType = UNSET
    sse_read_timeout: float | None | UnsetType = UNSET
    static_headers: dict[str, str] | None | UnsetType = UNSET
    allowed_tool_names: tuple[str, ...] | None | UnsetType = UNSET
    tool_argument_defaults: dict[str, dict[str, Any]] | None | UnsetType = UNSET
