from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from collections.abc import Mapping, Sequence
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from typing import (
    Annotated,
    Any,
    Awaitable,
    Callable,
    Literal,
    TypedDict,
    TypeVar,
    cast,
)

import mcp.types as mcp_types
from langchain_core.tools import ArgsSchema, BaseTool, InjectedToolArg, StructuredTool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.sessions import Connection as MCPConnection
from langchain_mcp_adapters.sessions import create_session
from langchain_mcp_adapters.tools import load_mcp_tools
from mcp import ClientSession

from core.crypto import aes_decrypt, aes_encrypt
from core.errors.mcp import MCPConfigError, MCPConnectionError
from models.mcp import (
    DBMCPPromptSnapshot,
    DBMCPResourceSnapshot,
    DBMCPResourceTemplateSnapshot,
    DBMCPServer,
    DBMCPToolSnapshot,
    MCPRuntimeAuth,
)

RuntimeAuthMapping = dict[str, MCPRuntimeAuth | Mapping[str, object]]
PaginatedItemT = TypeVar("PaginatedItemT")
PaginatedResponseT = TypeVar("PaginatedResponseT")


class CatalogDiscoveryResult(TypedDict):
    tools: list[DBMCPToolSnapshot]
    prompts: list[DBMCPPromptSnapshot]
    resources: list[DBMCPResourceSnapshot]
    resource_templates: list[DBMCPResourceTemplateSnapshot]


@dataclass(frozen=True, slots=True)
class ConnectionEntry:
    server: DBMCPServer
    connection_name: str
    connection: MCPConnection


@dataclass(frozen=True, slots=True)
class MCPToolSessionEntry:
    server: DBMCPServer
    connection_name: str
    session: ClientSession


@dataclass(slots=True)
class MCPToolSessionScope:
    entries: tuple[MCPToolSessionEntry, ...]
    _exit_stack: AsyncExitStack = field(repr=False)
    binding_scope: str = field(default_factory=lambda: uuid.uuid4().hex)
    _load_lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)
    _loaded_tools: tuple[BaseTool, ...] | None = field(default=None, init=False, repr=False)
    _closed: bool = field(default=False, init=False, repr=False)

    async def load_tools(self) -> tuple[list[BaseTool], bool]:
        if self._closed:
            raise MCPConnectionError(message="MCP tool session scope is already closed.")

        async with self._load_lock:
            if self._loaded_tools is not None:
                return list(self._loaded_tools), True

            tool_lists = await asyncio.gather(
                *(self._load_server_tools(entry) for entry in self.entries)
            )
            self._loaded_tools = tuple(
                tool
                for tool_list in tool_lists
                for tool in tool_list
            )
            return list(self._loaded_tools), False

    async def aclose(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self._exit_stack.aclose()

    async def _load_server_tools(self, entry: MCPToolSessionEntry) -> list[BaseTool]:
        tools = await load_mcp_tools(
            entry.session,
            server_name=entry.connection_name,
            tool_name_prefix=True,
        )
        return MCPClient._adapt_loaded_tools(
            entry.server,
            tools=tools,
            prefix=f"{entry.connection_name}_",
        )


class MCPClient:
    def __init__(self, encryption_key: str):
        self._encryption_key = encryption_key

    async def open_tool_session_scope(
        self,
        servers: list[DBMCPServer],
        runtime_auth_by_server_id: RuntimeAuthMapping | None = None,
    ) -> MCPToolSessionScope:
        if not servers:
            return MCPToolSessionScope(entries=(), _exit_stack=AsyncExitStack())

        entries = self._build_connection_entries(
            servers=servers,
            runtime_auth_by_server_id=runtime_auth_by_server_id,
        )
        server_ids = self._resolve_server_ids(servers)
        exit_stack = AsyncExitStack()
        scope_entries: list[MCPToolSessionEntry] = []

        try:
            for entry in entries:
                session = await exit_stack.enter_async_context(
                    create_session(entry.connection)
                )
                await session.initialize()
                scope_entries.append(
                    MCPToolSessionEntry(
                        server=entry.server,
                        connection_name=entry.connection_name,
                        session=session,
                    )
                )
        except MCPConfigError:
            await exit_stack.aclose()
            raise
        except Exception as exc:
            await exit_stack.aclose()
            raise self._build_connection_error(
                "Unable to open MCP tool sessions",
                exc,
                extra={"server_ids": server_ids},
            ) from exc

        return MCPToolSessionScope(
            entries=tuple(scope_entries),
            _exit_stack=exit_stack,
        )

    async def load_tools(
        self,
        servers: list[DBMCPServer],
        runtime_auth_by_server_id: RuntimeAuthMapping | None = None,
        tool_session_scope: MCPToolSessionScope | None = None,
    ) -> list[BaseTool]:
        if not servers:
            return []
        server_ids = self._resolve_server_ids(servers)

        if tool_session_scope is not None:
            try:
                tools, _ = await tool_session_scope.load_tools()
                return tools
            except MCPConfigError:
                raise
            except Exception as exc:
                raise self._build_connection_error(
                    "Unable to load tools from MCP servers",
                    exc,
                    extra={"server_ids": server_ids},
                ) from exc

        entries = self._build_connection_entries(
            servers=servers,
            runtime_auth_by_server_id=runtime_auth_by_server_id,
        )
        client = self._build_multi_server_client(entries, tool_name_prefix=True)

        try:
            tool_lists = await asyncio.gather(
                *(self._load_server_tools(client, entry) for entry in entries)
            )
        except MCPConfigError:
            raise
        except Exception as exc:
            raise self._build_connection_error(
                "Unable to load tools from MCP servers",
                exc,
                extra={"server_ids": server_ids},
            ) from exc

        return [tool for tool_list in tool_lists for tool in tool_list]

    async def discover_catalog(
        self,
        server: DBMCPServer,
        runtime_auth: MCPRuntimeAuth | Mapping[str, object] | None = None,
    ) -> CatalogDiscoveryResult:
        entry = self._build_connection_entries(
            servers=[server],
            runtime_auth_by_server_id={
                str(server.get("_id") or ""): runtime_auth,
            }
            if runtime_auth is not None
            else None,
        )[0]
        client = self._build_multi_server_client([entry])

        try:
            async with client.session(entry.connection_name) as session:
                tools = await self._list_all_tools(session)
                prompts = await self._list_all_prompts(session)
                resources = await self._list_all_resources(session)
                resource_templates = await self._list_all_resource_templates(session)
        except MCPConfigError:
            raise
        except Exception as exc:
            raise self._build_connection_error(
                "Unable to discover MCP catalog",
                exc,
                extra={
                    "server_id": str(server.get("_id") or ""),
                    "server_name": str(server.get("name") or ""),
                },
            ) from exc

        allowed_tool_names = self._allowed_tool_names(server)
        if allowed_tool_names is not None:
            tools = [
                tool
                for tool in tools
                if self._is_allowed_tool_name(
                    cast(str, getattr(tool, "name", "")),
                    prefix="",
                    allowed_tool_names=allowed_tool_names,
                )
            ]

        return {
            "tools": [self._tool_snapshot(tool) for tool in tools],
            "prompts": [self._prompt_snapshot(prompt) for prompt in prompts],
            "resources": [self._resource_snapshot(resource) for resource in resources],
            "resource_templates": [
                self._resource_template_snapshot(resource_template)
                for resource_template in resource_templates
            ],
        }

    def encrypt_static_headers(self, headers: Mapping[str, str] | None) -> str | None:
        if not headers:
            return None
        if not self._encryption_key:
            raise MCPConfigError(message="ENCRYPTION_KEY is not configured for MCP static auth")
        normalized_headers = {
            key.strip(): value
            for key, value in headers.items()
            if isinstance(key, str) and key.strip() and isinstance(value, str)
        }
        if not normalized_headers:
            return None
        payload = json.dumps(normalized_headers, sort_keys=True, separators=(",", ":"))
        return aes_encrypt(payload, self._encryption_key)

    def get_static_header_names(self, server: DBMCPServer) -> tuple[str, ...]:
        headers = self._decrypt_static_headers(
            server_id=str(server.get("_id") or ""),
            url=str(server.get("url") or ""),
            encrypted_headers=server.get("headers_encrypted"),
        )
        return tuple(sorted(headers.keys()))

    def build_connections(
        self,
        servers: list[DBMCPServer],
        runtime_auth_by_server_id: RuntimeAuthMapping | None = None,
    ) -> dict[str, MCPConnection]:
        entries = self._build_connection_entries(
            servers=servers,
            runtime_auth_by_server_id=runtime_auth_by_server_id,
        )
        return {
            entry.connection_name: entry.connection
            for entry in entries
        }

    def merge_headers(
        self,
        static_headers: dict[str, str] | None,
        runtime_auth: MCPRuntimeAuth | Mapping[str, object] | None,
        *,
        server_id: str | None = None,
    ) -> dict[str, str]:
        merged: dict[str, str] = dict(static_headers or {})
        if runtime_auth is None:
            return merged

        auth_type = runtime_auth.get("type")
        if auth_type == "bearer":
            token = runtime_auth.get("token")
            if not isinstance(token, str) or not token.strip():
                raise MCPConfigError(
                    message="Invalid runtime bearer token for MCP server",
                    extra={"server_id": server_id},
                )
            merged["Authorization"] = f"Bearer {token.strip()}"
            return merged

        if auth_type == "headers":
            headers = runtime_auth.get("headers")
            if not isinstance(headers, dict):
                raise MCPConfigError(
                    message="Invalid runtime headers for MCP server",
                    extra={"server_id": server_id},
                )
            for key, value in headers.items():
                if isinstance(key, str) and isinstance(value, str):
                    merged[key] = value
            return merged

        if auth_type is not None:
            raise MCPConfigError(
                message="Unsupported runtime auth type for MCP server",
                extra={"server_id": server_id, "type": auth_type},
            )

        return merged

    @staticmethod
    def normalize_runtime_auth(
        runtime_auth_by_server_id: RuntimeAuthMapping | None,
    ) -> dict[str, dict[str, Any]]:
        normalized: dict[str, dict[str, Any]] = {}
        if not runtime_auth_by_server_id:
            return normalized

        for server_id in sorted(runtime_auth_by_server_id.keys()):
            auth_payload = runtime_auth_by_server_id.get(server_id)
            if not isinstance(auth_payload, Mapping):
                continue

            entry: dict[str, Any] = {}
            auth_type = auth_payload.get("type")
            if isinstance(auth_type, str):
                entry["type"] = auth_type

            token = auth_payload.get("token")
            if isinstance(token, str):
                entry["token"] = token

            headers = auth_payload.get("headers")
            if isinstance(headers, dict):
                entry["headers"] = {
                    key: value
                    for key, value in sorted(headers.items(), key=lambda item: str(item[0]))
                    if isinstance(key, str) and isinstance(value, str)
                }

            if entry:
                normalized[server_id] = entry

        return normalized

    @classmethod
    def tools_cache_fingerprint(
        cls,
        server_ids: list[str],
        runtime_auth_by_server_id: RuntimeAuthMapping | None,
    ) -> str:
        payload = {
            "server_ids": sorted(server_ids),
            "runtime_auth": cls.normalize_runtime_auth(runtime_auth_by_server_id),
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _build_multi_server_client(
        entries: Sequence[ConnectionEntry],
        *,
        tool_name_prefix: bool = False,
    ) -> MultiServerMCPClient:
        return MultiServerMCPClient(
            {
                entry.connection_name: entry.connection
                for entry in entries
            },
            tool_name_prefix=tool_name_prefix,
        )

    async def _load_server_tools(
        self,
        client: MultiServerMCPClient,
        entry: ConnectionEntry,
    ) -> list[BaseTool]:
        tools = await client.get_tools(server_name=entry.connection_name)
        return self._adapt_loaded_tools(
            entry.server,
            tools=tools,
            prefix=f"{entry.connection_name}_",
        )

    @classmethod
    def _adapt_loaded_tools(
        cls,
        server: DBMCPServer,
        *,
        tools: Sequence[BaseTool],
        prefix: str,
    ) -> list[BaseTool]:
        allowed_tool_names = cls._allowed_tool_names(server)
        tool_argument_defaults = cls._tool_argument_defaults(server)
        adapted_tools: list[BaseTool] = []

        for tool in tools:
            tool_name = tool.name
            if not cls._is_allowed_tool_name(
                tool_name,
                prefix=prefix,
                allowed_tool_names=allowed_tool_names,
            ):
                continue

            normalized_name = cls._normalize_tool_name(tool_name, prefix=prefix)
            defaults = tool_argument_defaults.get(normalized_name)
            if defaults:
                adapted_tools.append(
                    cls._wrap_tool_with_argument_defaults(
                        tool,
                        argument_defaults=defaults,
                    )
                )
                continue
            adapted_tools.append(tool)

        return adapted_tools

    @staticmethod
    def _is_allowed_tool_name(
        tool_name: str,
        *,
        prefix: str,
        allowed_tool_names: set[str] | None,
    ) -> bool:
        if allowed_tool_names is None:
            return True
        normalized_name = MCPClient._normalize_tool_name(tool_name, prefix=prefix)
        return normalized_name in allowed_tool_names

    @staticmethod
    def _normalize_tool_name(tool_name: str, *, prefix: str) -> str:
        return tool_name[len(prefix):] if tool_name.startswith(prefix) else tool_name

    @staticmethod
    def _build_connection_error(
        message: str,
        exc: Exception,
        *,
        extra: dict[str, Any],
    ) -> MCPConnectionError:
        detail = str(exc).strip()
        hint = MCPClient._build_transport_hint(exc)
        error_extra = dict(extra)
        if hint is not None:
            error_extra["hint"] = hint
        if detail:
            error_extra["detail"] = detail

        final_message = message if not detail else f"{message}: {detail}"
        return MCPConnectionError(message=final_message, extra=error_extra)

    @staticmethod
    def _build_transport_hint(exc: Exception) -> str | None:
        lower_error = str(exc).lower()
        if "text/event-stream" in lower_error and "application/json" in lower_error:
            return (
                "MCP endpoint appears to be streamable_http. "
                "Use transport='streamable_http' (or 'http') instead of 'sse'."
            )
        return None

    @staticmethod
    def _normalize_transport(transport: object) -> Literal["sse", "streamable_http"]:
        normalized = transport.strip().lower() if isinstance(transport, str) else ""
        if normalized == "http":
            return "streamable_http"
        if normalized in {"sse", "streamable_http"}:
            return cast(Literal["sse", "streamable_http"], normalized)
        raise MCPConfigError(
            message=(
                "Unsupported MCP transport. Supported transports: "
                "'sse', 'streamable_http' (alias: 'http')"
            ),
            extra={"transport": transport},
        )

    @staticmethod
    def _normalize_server_url(
        url: object,
        *,
        server_id: str,
    ) -> str:
        if not isinstance(url, str) or not url.strip():
            raise MCPConfigError(
                message="Invalid MCP server URL",
                extra={"server_id": server_id, "url": url},
            )
        return url.strip()

    @staticmethod
    def _build_connection_payload(
        *,
        transport: Literal["sse", "streamable_http"],
        url: str,
        timeout: object,
        sse_read_timeout: object,
        headers: Mapping[str, str] | None,
    ) -> MCPConnection:
        connection_payload: dict[str, Any] = {
            "transport": transport,
            "url": url,
        }
        if isinstance(timeout, (int, float)) and timeout > 0:
            connection_payload["timeout"] = float(timeout)
        if (
            transport == "sse"
            and isinstance(sse_read_timeout, (int, float))
            and sse_read_timeout > 0
        ):
            connection_payload["sse_read_timeout"] = float(sse_read_timeout)
        if headers:
            connection_payload["headers"] = dict(headers)
        return cast(MCPConnection, connection_payload)

    @staticmethod
    def _unique_connection_name(
        *,
        desired_name: str,
        server_id: str,
        seen_names: set[str],
    ) -> str:
        connection_name = desired_name
        if connection_name in seen_names:
            connection_name = f"{desired_name}_{server_id}"
        seen_names.add(connection_name)
        return connection_name

    def _build_connection_entries(
        self,
        *,
        servers: list[DBMCPServer],
        runtime_auth_by_server_id: RuntimeAuthMapping | None,
    ) -> list[ConnectionEntry]:
        entries: list[ConnectionEntry] = []
        auth_by_server_id = runtime_auth_by_server_id or {}
        seen_names: set[str] = set()

        for server in servers:
            server_id = str(server.get("_id") or "")
            server_name = str(server.get("name") or server_id)
            transport = self._normalize_transport(server.get("transport"))
            normalized_url = self._normalize_server_url(
                server.get("url"),
                server_id=server_id,
            )

            static_headers = self._decrypt_static_headers(
                server_id=server_id,
                url=normalized_url,
                encrypted_headers=server.get("headers_encrypted"),
            )
            headers = self.merge_headers(
                static_headers,
                auth_by_server_id.get(server_id),
                server_id=server_id,
            )
            connection_name = self._unique_connection_name(
                desired_name=server_name,
                server_id=server_id,
                seen_names=seen_names,
            )
            connection_payload = self._build_connection_payload(
                transport=transport,
                url=normalized_url,
                timeout=server.get("timeout"),
                sse_read_timeout=server.get("sse_read_timeout"),
                headers=headers,
            )

            entries.append(
                ConnectionEntry(
                    server=server,
                    connection_name=connection_name,
                    connection=connection_payload,
                )
            )

        return entries

    def _decrypt_static_headers(
        self,
        *,
        server_id: str,
        url: str,
        encrypted_headers: str | None,
    ) -> dict[str, str]:
        if not encrypted_headers:
            return {}
        if not self._encryption_key:
            raise MCPConfigError(
                message="ENCRYPTION_KEY is not configured for MCP static auth",
                extra={"server_id": server_id, "url": url},
            )
        decrypted = aes_decrypt(encrypted_headers, self._encryption_key)
        try:
            parsed = json.loads(decrypted)
        except json.JSONDecodeError as exc:
            raise MCPConfigError(
                message="Invalid encrypted headers payload for MCP server",
                extra={"server_id": server_id, "url": url},
            ) from exc

        if not isinstance(parsed, dict):
            raise MCPConfigError(
                message="Decrypted MCP headers must be an object",
                extra={"server_id": server_id, "url": url},
            )

        return {
            key: value
            for key, value in parsed.items()
            if isinstance(key, str) and isinstance(value, str)
        }

    @staticmethod
    async def _list_all_paginated(
        *,
        fetch_page: Callable[
            [mcp_types.PaginatedRequestParams | None],
            Awaitable[PaginatedResponseT],
        ],
        extract_items: Callable[[PaginatedResponseT], Sequence[PaginatedItemT] | None],
        extract_next_cursor: Callable[[PaginatedResponseT], str | None],
    ) -> list[PaginatedItemT]:
        current_cursor: str | None = None
        items: list[PaginatedItemT] = []
        while True:
            result = await fetch_page(MCPClient._build_pagination_params(current_cursor))
            page_items = extract_items(result)
            if page_items:
                items.extend(page_items)
            next_cursor = extract_next_cursor(result)
            if not next_cursor:
                return items
            current_cursor = next_cursor

    @staticmethod
    async def _list_all_tools(session: ClientSession) -> list[mcp_types.Tool]:
        return await MCPClient._list_all_paginated(
            fetch_page=lambda params: session.list_tools(params=params),
            extract_items=lambda result: result.tools,
            extract_next_cursor=lambda result: result.nextCursor,
        )

    @staticmethod
    async def _list_all_prompts(session: ClientSession) -> list[mcp_types.Prompt]:
        return await MCPClient._list_all_paginated(
            fetch_page=lambda params: session.list_prompts(params=params),
            extract_items=lambda result: result.prompts,
            extract_next_cursor=lambda result: result.nextCursor,
        )

    @staticmethod
    async def _list_all_resources(session: ClientSession) -> list[mcp_types.Resource]:
        return await MCPClient._list_all_paginated(
            fetch_page=lambda params: session.list_resources(params=params),
            extract_items=lambda result: result.resources,
            extract_next_cursor=lambda result: result.nextCursor,
        )

    @staticmethod
    async def _list_all_resource_templates(
        session: ClientSession,
    ) -> list[mcp_types.ResourceTemplate]:
        return await MCPClient._list_all_paginated(
            fetch_page=lambda params: session.list_resource_templates(params=params),
            extract_items=lambda result: result.resourceTemplates,
            extract_next_cursor=lambda result: result.nextCursor,
        )

    @staticmethod
    def _build_pagination_params(
        cursor: str | None,
    ) -> mcp_types.PaginatedRequestParams | None:
        if cursor is None:
            return None
        return mcp_types.PaginatedRequestParams(cursor=cursor)

    @staticmethod
    def _allowed_tool_names(server: DBMCPServer) -> set[str] | None:
        raw_names = server.get("allowed_tool_names")
        if not isinstance(raw_names, list):
            return None
        normalized = {
            str(name).strip()
            for name in raw_names
            if isinstance(name, str) and name.strip()
        }
        return normalized or set()

    @staticmethod
    def _tool_argument_defaults(server: DBMCPServer) -> dict[str, dict[str, Any]]:
        raw_value = server.get("tool_argument_defaults")
        if not isinstance(raw_value, Mapping):
            return {}

        normalized: dict[str, dict[str, Any]] = {}
        for raw_tool_name, raw_defaults in raw_value.items():
            if not isinstance(raw_tool_name, str) or not raw_tool_name.strip():
                continue
            if not isinstance(raw_defaults, Mapping):
                continue
            defaults = {
                str(argument_name).strip(): value
                for argument_name, value in raw_defaults.items()
                if isinstance(argument_name, str) and argument_name.strip()
            }
            if defaults:
                normalized[raw_tool_name.strip()] = defaults
        return normalized

    @classmethod
    def _wrap_tool_with_argument_defaults(
        cls,
        tool: BaseTool,
        *,
        argument_defaults: Mapping[str, Any],
    ) -> BaseTool:
        args_schema = tool.args_schema
        filtered_args_schema = cls._filter_tool_args_schema(
            args_schema,
            hidden_argument_names=set(argument_defaults.keys()),
        )
        response_format = getattr(tool, "response_format", "content")
        original_coroutine = getattr(tool, "coroutine", None)
        original_func = getattr(tool, "func", None)
        async_callable: Callable[..., Awaitable[Any]] | None = (
            cast(Callable[..., Awaitable[Any]], original_coroutine)
            if callable(original_coroutine)
            else None
        )
        sync_callable: Callable[..., Any] | None = (
            cast(Callable[..., Any], original_func)
            if callable(original_func)
            else None
        )
        normalized_response_format: Literal["content", "content_and_artifact"] = (
            "content_and_artifact"
            if response_format == "content_and_artifact"
            else "content"
        )

        def _merge_arguments(arguments: Mapping[str, Any]) -> dict[str, Any]:
            merged_arguments = {
                key: value
                for key, value in arguments.items()
                if key not in argument_defaults
            }
            merged_arguments.update(dict(argument_defaults))
            return merged_arguments

        def _call_sync(
            runtime: Annotated[object | None, InjectedToolArg()] = None,
            **arguments: Any,
        ) -> Any:
            merged_arguments = _merge_arguments(arguments)
            if sync_callable is not None:
                if runtime is None:
                    return sync_callable(**merged_arguments)
                return sync_callable(runtime=runtime, **merged_arguments)
            return tool.invoke(merged_arguments)

        async def _call_async(
            runtime: Annotated[object | None, InjectedToolArg()] = None,
            **arguments: Any,
        ) -> Any:
            merged_arguments = _merge_arguments(arguments)
            if async_callable is not None:
                if runtime is None:
                    return await async_callable(**merged_arguments)
                return await async_callable(runtime=runtime, **merged_arguments)
            return await tool.ainvoke(merged_arguments)

        metadata = dict(getattr(tool, "metadata", None) or {})
        metadata["mcp_argument_defaults"] = dict(argument_defaults)

        return StructuredTool(
            name=tool.name,
            description=getattr(tool, "description", "") or "",
            args_schema=cast(Any, filtered_args_schema),
            return_direct=bool(getattr(tool, "return_direct", False)),
            verbose=bool(getattr(tool, "verbose", False)),
            callbacks=getattr(tool, "callbacks", None),
            tags=list(getattr(tool, "tags", None) or ()),
            metadata=metadata or None,
            handle_tool_error=getattr(tool, "handle_tool_error", False),
            handle_validation_error=getattr(tool, "handle_validation_error", False),
            response_format=normalized_response_format,
            func=_call_sync,
            coroutine=_call_async,
        )

    @staticmethod
    def _filter_tool_args_schema(
        args_schema: ArgsSchema | None,
        *,
        hidden_argument_names: set[str],
    ) -> object:
        if not isinstance(args_schema, Mapping):
            return args_schema

        filtered_schema = dict(args_schema)
        raw_properties = args_schema.get("properties")
        if not isinstance(raw_properties, Mapping):
            return filtered_schema

        filtered_schema["properties"] = {
            key: value
            for key, value in raw_properties.items()
            if key not in hidden_argument_names
        }

        raw_required = args_schema.get("required")
        if isinstance(raw_required, list):
            filtered_required = [
                item
                for item in raw_required
                if isinstance(item, str) and item not in hidden_argument_names
            ]
            if filtered_required:
                filtered_schema["required"] = filtered_required
            else:
                filtered_schema.pop("required", None)

        return filtered_schema

    @staticmethod
    def _tool_snapshot(tool: mcp_types.Tool) -> DBMCPToolSnapshot:
        annotations = tool.annotations.model_dump() if tool.annotations is not None else None
        input_schema = dict(tool.inputSchema) if isinstance(tool.inputSchema, Mapping) else None
        output_schema = dict(tool.outputSchema) if isinstance(tool.outputSchema, Mapping) else None
        meta = dict(tool.meta) if isinstance(tool.meta, Mapping) else None
        return {
            "name": tool.name,
            "title": tool.title,
            "description": tool.description,
            "input_schema": input_schema,
            "output_schema": output_schema,
            "annotations": annotations,
            "meta": meta,
        }

    @staticmethod
    def _prompt_snapshot(prompt: mcp_types.Prompt) -> DBMCPPromptSnapshot:
        meta = dict(prompt.meta) if isinstance(prompt.meta, Mapping) else None
        arguments = [dict(argument.model_dump()) for argument in (prompt.arguments or [])]
        return {
            "name": prompt.name,
            "title": prompt.title,
            "description": prompt.description,
            "arguments": arguments,
            "meta": meta,
        }

    @staticmethod
    def _resource_snapshot(resource: mcp_types.Resource) -> DBMCPResourceSnapshot:
        annotations = resource.annotations.model_dump() if resource.annotations is not None else None
        meta = dict(resource.meta) if isinstance(resource.meta, Mapping) else None
        return {
            "name": resource.name,
            "title": resource.title,
            "uri": str(resource.uri),
            "description": resource.description,
            "mime_type": resource.mimeType,
            "size": resource.size,
            "annotations": annotations,
            "meta": meta,
        }

    @staticmethod
    def _resource_template_snapshot(
        resource_template: mcp_types.ResourceTemplate,
    ) -> DBMCPResourceTemplateSnapshot:
        annotations = (
            resource_template.annotations.model_dump()
            if resource_template.annotations is not None
            else None
        )
        meta = dict(resource_template.meta) if isinstance(resource_template.meta, Mapping) else None
        return {
            "name": resource_template.name,
            "title": resource_template.title,
            "uri_template": resource_template.uriTemplate,
            "description": resource_template.description,
            "mime_type": resource_template.mimeType,
            "annotations": annotations,
            "meta": meta,
        }

    @staticmethod
    def _resolve_server_ids(servers: Sequence[DBMCPServer]) -> list[str]:
        server_ids: list[str] = []
        for idx, server in enumerate(servers):
            server_id = server.get("_id")
            if server_id is not None:
                server_ids.append(str(server_id))
                continue
            fallback_name = str(server.get("name") or "").strip()
            fallback_url = str(server.get("url") or "").strip()
            server_ids.append(fallback_name or fallback_url or f"server_{idx}")
        return server_ids
