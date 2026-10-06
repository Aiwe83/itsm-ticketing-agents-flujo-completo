from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Mapping, Sequence, cast

from bson import ObjectId
from msgspec import UNSET

from core.errors import ApplicationError, ResourceNotFoundError
from core.errors.mcp import MCPConfigError, MCPConnectionError
from mcp_integration.client import MCPClient
from models.common import DeleteResult
from models.mcp import (
    DBMCPPromptSnapshot,
    DBMCPResourceSnapshot,
    DBMCPResourceTemplateSnapshot,
    DBMCPServer,
    DBMCPToolSnapshot,
    CreateMCPPayload,
    MCP,
    MCPPromptSnapshot,
    MCPResourceSnapshot,
    MCPResourceTemplateSnapshot,
    MCPRuntimeAuth,
    MCPToolSnapshot,
    UpdateMCPPayload,
)
from repositories.mongodb.mcp import MCPServerRepository
from services.base import BaseService


class MCPService(BaseService):
    def __init__(
        self,
        repository: MCPServerRepository,
        mcp_client: MCPClient,
    ) -> None:
        self._repository = repository
        self._mcp_client = mcp_client

    async def list_mcps(self) -> tuple[MCP, ...]:
        try:
            documents = await self._repository.find_all()
            return tuple(self._to_model(document) for document in documents)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to list MCP servers.",
                status_code=500,
                exception=exc,
                error_name="mcp_query_error",
            ) from exc

    async def get_mcp(self, mcp_id: str) -> MCP:
        try:
            normalized_mcp_id = self._normalize_object_id(mcp_id, field_name="mcp_id")
            return self._to_model(await self._get_document(normalized_mcp_id))
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to load MCP server.",
                status_code=500,
                exception=exc,
                error_name="mcp_query_error",
            ) from exc

    async def create_mcp(self, payload: CreateMCPPayload) -> MCP:
        try:
            name = self._normalize_name(payload.name)
            await self._ensure_name_available(name)

            now = self._utcnow()
            document: DBMCPServer = {
                "name": name,
                "description": self._normalize_optional_text(payload.description),
                "account": self._normalize_optional_text(payload.account),
                "auth_type": payload.auth_type,
                "transport": self._normalize_transport(payload.transport),
                "url": self._normalize_endpoint(payload.endpoint),
                "enabled": payload.enabled,
                "headers_encrypted": None,
                "timeout": self._normalize_timeout(payload.timeout, field_name="timeout"),
                "sse_read_timeout": self._normalize_timeout(
                    payload.sse_read_timeout,
                    field_name="sse_read_timeout",
                ),
                "allowed_tool_names": self._normalize_names(payload.allowed_tool_names),
                "tool_argument_defaults": self._normalize_tool_argument_defaults(
                    payload.tool_argument_defaults
                ),
                "tools": [],
                "prompts": [],
                "resources": [],
                "resource_templates": [],
                "catalog_last_refreshed_at": None,
                "catalog_refresh_error": None,
                "created_at": now,
                "last_modified_at": now,
            }
            if document["transport"] != "sse":
                document["sse_read_timeout"] = None
            self._apply_auth_configuration(
                document,
                auth_type=payload.auth_type,
                static_headers=payload.static_headers,
                allow_missing_static_headers=False,
            )

            document.update(cast(Any, await self._catalog_refresh_fields(document)))
            self._validate_tool_argument_defaults(document)
            mcp_id = await self._repository.insert_one(cast(DBMCPServer, dict(document)))
            return await self.get_mcp(mcp_id)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to create MCP server.",
                status_code=500,
                exception=exc,
                error_name="mcp_mutation_error",
            ) from exc

    async def update_mcp(self, mcp_id: str, payload: UpdateMCPPayload) -> MCP:
        try:
            existing = await self._get_document(mcp_id)
            updated_document: DBMCPServer = cast(DBMCPServer, dict(existing))

            if payload.name is not UNSET:
                if payload.name is None:
                    raise ApplicationError(
                        message="MCP name cannot be null.",
                        status_code=400,
                        error_name="invalid_mcp_name",
                    )
                name = self._normalize_name(payload.name)
                existing_by_name = await self._repository.find_by_name(name)
                if existing_by_name is not None and str(existing_by_name.get("_id")) != str(
                    existing.get("_id")
                ):
                    raise ApplicationError(
                        message=f"MCP name '{name}' is already in use.",
                        status_code=409,
                        error_name="mcp_name_already_exists",
                    )
                updated_document["name"] = name

            if payload.description is not UNSET:
                updated_document["description"] = self._normalize_optional_text(payload.description)

            if payload.account is not UNSET:
                updated_document["account"] = self._normalize_optional_text(payload.account)

            if payload.transport is not UNSET:
                updated_document["transport"] = self._normalize_transport(payload.transport)

            if payload.endpoint is not UNSET:
                updated_document["url"] = self._normalize_endpoint(payload.endpoint)

            if payload.enabled is not UNSET:
                updated_document["enabled"] = payload.enabled

            if payload.timeout is not UNSET:
                updated_document["timeout"] = self._normalize_timeout(
                    payload.timeout,
                    field_name="timeout",
                )

            if payload.sse_read_timeout is not UNSET:
                updated_document["sse_read_timeout"] = self._normalize_timeout(
                    payload.sse_read_timeout,
                    field_name="sse_read_timeout",
                )

            if payload.allowed_tool_names is not UNSET:
                updated_document["allowed_tool_names"] = self._normalize_names(
                    payload.allowed_tool_names or ()
                )

            if payload.tool_argument_defaults is not UNSET:
                updated_document["tool_argument_defaults"] = self._normalize_tool_argument_defaults(
                    payload.tool_argument_defaults
                )

            final_auth_type = (
                payload.auth_type
                if payload.auth_type is not UNSET
                else updated_document.get("auth_type", "free")
            )
            updated_document["auth_type"] = final_auth_type
            if updated_document.get("transport") != "sse":
                updated_document["sse_read_timeout"] = None
            self._apply_auth_configuration(
                updated_document,
                auth_type=final_auth_type,
                static_headers=payload.static_headers,
                allow_missing_static_headers=True,
            )

            updated_document["last_modified_at"] = self._utcnow()
            updated_document.update(
                cast(Any, await self._catalog_refresh_fields(updated_document, existing=existing))
            )
            self._validate_tool_argument_defaults(updated_document)
            persisted_fields = dict(updated_document)
            persisted_fields.pop("_id", None)
            await self._repository.update_one(
                {"_id": ObjectId(mcp_id)},
                {"$set": persisted_fields},
            )
            return await self.get_mcp(mcp_id)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to update MCP server.",
                status_code=500,
                exception=exc,
                error_name="mcp_mutation_error",
            ) from exc

    async def delete_mcp(self, mcp_id: str) -> DeleteResult:
        try:
            await self._get_document(mcp_id)
            deleted = await self._repository.delete_one({"_id": ObjectId(mcp_id)})
            if not deleted:
                raise ResourceNotFoundError(f"MCP '{mcp_id}' was not found.")
            return DeleteResult(id=mcp_id, deleted=True)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to delete MCP server.",
                status_code=500,
                exception=exc,
                error_name="mcp_mutation_error",
            ) from exc

    async def refresh_catalog(self, mcp_id: str) -> MCP:
        try:
            existing = await self._get_document(mcp_id)
            update_fields = await self._catalog_refresh_fields(existing, existing=existing)
            update_fields["last_modified_at"] = self._utcnow()
            await self._repository.update_one(
                {"_id": ObjectId(mcp_id)},
                {"$set": update_fields},
            )
            return await self.get_mcp(mcp_id)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to refresh MCP catalog.",
                status_code=500,
                exception=exc,
                error_name="mcp_mutation_error",
            ) from exc

    async def _ensure_name_available(self, name: str) -> None:
        existing = await self._repository.find_by_name(name)
        if existing is not None:
            raise ApplicationError(
                message=f"MCP name '{name}' is already in use.",
                status_code=409,
                error_name="mcp_name_already_exists",
            )

    async def _get_document(self, mcp_id: str) -> DBMCPServer:
        normalized_mcp_id = self._normalize_object_id(mcp_id, field_name="mcp_id")
        document = await self._repository.find_by_id(normalized_mcp_id)
        if document is None:
            raise ResourceNotFoundError(f"MCP '{mcp_id}' was not found.")
        return document

    async def _catalog_refresh_fields(
        self,
        document: DBMCPServer,
        *,
        existing: DBMCPServer | None = None,
    ) -> dict[str, Any]:
        try:
            runtime_auth = self._build_runtime_auth(document)
            catalog = await self._mcp_client.discover_catalog(document, runtime_auth=runtime_auth)
            return {
                "tools": catalog["tools"],
                "prompts": catalog["prompts"],
                "resources": catalog["resources"],
                "resource_templates": catalog["resource_templates"],
                "catalog_last_refreshed_at": self._utcnow(),
                "catalog_refresh_error": None,
            }
        except (MCPConfigError, MCPConnectionError) as exc:
            return {
                "tools": list(existing.get("tools", [])) if existing is not None else [],
                "prompts": list(existing.get("prompts", [])) if existing is not None else [],
                "resources": list(existing.get("resources", [])) if existing is not None else [],
                "resource_templates": list(existing.get("resource_templates", []))
                if existing is not None
                else [],
                "catalog_last_refreshed_at": existing.get("catalog_last_refreshed_at")
                if existing is not None
                else None,
                "catalog_refresh_error": str(exc),
            }

    def _build_runtime_auth(
        self,
        document: DBMCPServer,
    ) -> MCPRuntimeAuth | None:
        del document
        return None

    def _apply_auth_configuration(
        self,
        document: DBMCPServer,
        *,
        auth_type: str,
        static_headers: Mapping[str, str] | None | Any,
        allow_missing_static_headers: bool,
    ) -> None:
        if auth_type == "free":
            if static_headers is not UNSET and static_headers is not None:
                raise ApplicationError(
                    message="Free MCP auth does not accept static headers.",
                    status_code=400,
                    error_name="invalid_mcp_auth_configuration",
                )
            document["headers_encrypted"] = None
            return

        if auth_type == "static_headers":
            if static_headers is not UNSET:
                document["headers_encrypted"] = self._mcp_client.encrypt_static_headers(static_headers)
            if not document.get("headers_encrypted") and not allow_missing_static_headers:
                raise ApplicationError(
                    message="Static header MCP auth requires at least one header.",
                    status_code=400,
                    error_name="invalid_mcp_auth_configuration",
                )
            if not document.get("headers_encrypted"):
                raise ApplicationError(
                    message="Static header MCP auth requires at least one header.",
                    status_code=400,
                    error_name="invalid_mcp_auth_configuration",
                )
            return

        raise ApplicationError(
            message=f"Unsupported MCP auth_type '{auth_type}'.",
            status_code=400,
            error_name="invalid_mcp_auth_configuration",
        )

    def _to_model(self, document: DBMCPServer) -> MCP:
        transport = document.get("transport", "streamable_http")
        if transport == "streamable_http":
            transport = "http"
        try:
            static_header_names = self._mcp_client.get_static_header_names(document)
        except MCPConfigError:
            static_header_names = ()
        raw_tool_argument_defaults = document.get("tool_argument_defaults")

        return MCP(
            id=str(document.get("_id", "")),
            name=str(document.get("name", "")),
            description=document.get("description"),
            auth_type=document.get("auth_type", "free"),
            transport=transport,
            endpoint=document.get("url"),
            account=document.get("account"),
            enabled=bool(document.get("enabled", True)),
            timeout=self._to_float(document.get("timeout")),
            sse_read_timeout=self._to_float(document.get("sse_read_timeout")),
            has_static_headers=bool(document.get("headers_encrypted")),
            static_header_names=static_header_names,
            allowed_tool_names=tuple(
                str(name)
                for name in document.get("allowed_tool_names", [])
                if isinstance(name, str) and name.strip()
            ),
            tool_argument_defaults={
                str(tool_name): {
                    str(argument_name): value
                    for argument_name, value in defaults.items()
                    if isinstance(argument_name, str) and argument_name.strip()
                }
                for tool_name, defaults in raw_tool_argument_defaults.items()
                if isinstance(tool_name, str)
                and tool_name.strip()
                and isinstance(defaults, Mapping)
            }
            if isinstance(raw_tool_argument_defaults, Mapping)
            else {},
            tools=tuple(self._to_tool_snapshot(item) for item in document.get("tools", [])),
            prompts=tuple(self._to_prompt_snapshot(item) for item in document.get("prompts", [])),
            resources=tuple(
                self._to_resource_snapshot(item) for item in document.get("resources", [])
            ),
            resource_templates=tuple(
                self._to_resource_template_snapshot(item)
                for item in document.get("resource_templates", [])
            ),
            catalog_last_refreshed_at=document.get("catalog_last_refreshed_at"),
            catalog_refresh_error=document.get("catalog_refresh_error"),
        )

    @staticmethod
    def _to_tool_snapshot(item: DBMCPToolSnapshot) -> MCPToolSnapshot:
        return MCPToolSnapshot(
            name=str(item.get("name", "")),
            title=item.get("title"),
            description=item.get("description"),
            input_schema=item.get("input_schema"),
            output_schema=item.get("output_schema"),
            annotations=item.get("annotations"),
            meta=item.get("meta"),
        )

    @staticmethod
    def _to_prompt_snapshot(item: DBMCPPromptSnapshot) -> MCPPromptSnapshot:
        return MCPPromptSnapshot(
            name=str(item.get("name", "")),
            title=item.get("title"),
            description=item.get("description"),
            arguments=tuple(
                argument
                for argument in item.get("arguments", [])
                if isinstance(argument, dict)
            ),
            meta=item.get("meta"),
        )

    @staticmethod
    def _to_resource_snapshot(item: DBMCPResourceSnapshot) -> MCPResourceSnapshot:
        return MCPResourceSnapshot(
            uri=str(item.get("uri", "")),
            name=item.get("name"),
            title=item.get("title"),
            description=item.get("description"),
            mime_type=item.get("mime_type"),
            size=item.get("size"),
            annotations=item.get("annotations"),
            meta=item.get("meta"),
        )

    @staticmethod
    def _to_resource_template_snapshot(
        item: DBMCPResourceTemplateSnapshot,
    ) -> MCPResourceTemplateSnapshot:
        return MCPResourceTemplateSnapshot(
            name=str(item.get("name", "")),
            uri_template=str(item.get("uri_template", "")),
            title=item.get("title"),
            description=item.get("description"),
            mime_type=item.get("mime_type"),
            annotations=item.get("annotations"),
            meta=item.get("meta"),
        )

    @staticmethod
    def _normalize_name(name: str) -> str:
        normalized = name.strip()
        if not normalized:
            raise ApplicationError(
                message="MCP name cannot be empty.",
                status_code=400,
                error_name="invalid_mcp_name",
            )
        return normalized

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @staticmethod
    def _normalize_endpoint(endpoint: str | None) -> str:
        normalized = (endpoint or "").strip()
        if not normalized:
            raise ApplicationError(
                message="MCP endpoint cannot be empty.",
                status_code=400,
                error_name="invalid_mcp_endpoint",
            )
        return normalized

    @staticmethod
    def _normalize_transport(transport: str) -> Literal["sse", "streamable_http"]:
        normalized = transport.strip().lower()
        if normalized == "http":
            return "streamable_http"
        if normalized in {"sse", "streamable_http"}:
            return cast(Literal["sse", "streamable_http"], normalized)
        raise ApplicationError(
            message="Unsupported MCP transport.",
            status_code=400,
            error_name="invalid_mcp_transport",
        )

    @staticmethod
    def _normalize_timeout(value: float | None, *, field_name: str) -> float | None:
        if value is None:
            return None
        normalized = float(value)
        if normalized <= 0:
            raise ApplicationError(
                message=f"{field_name} must be greater than zero.",
                status_code=400,
                error_name="invalid_mcp_timeout",
            )
        return normalized

    @staticmethod
    def _normalize_names(values: Sequence[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for raw_value in values:
            value = raw_value.strip()
            if not value or value in seen:
                continue
            seen.add(value)
            normalized.append(value)
        return normalized

    @staticmethod
    def _normalize_tool_argument_defaults(
        value: Mapping[str, Mapping[str, Any]] | None | Any,
    ) -> dict[str, dict[str, Any]]:
        if value is None:
            return {}
        if not isinstance(value, Mapping):
            raise ApplicationError(
                message="tool_argument_defaults must be an object.",
                status_code=400,
                error_name="invalid_mcp_tool_argument_defaults",
            )

        normalized: dict[str, dict[str, Any]] = {}
        for raw_tool_name, raw_defaults in value.items():
            if not isinstance(raw_tool_name, str) or not raw_tool_name.strip():
                raise ApplicationError(
                    message="tool_argument_defaults keys must be non-empty strings.",
                    status_code=400,
                    error_name="invalid_mcp_tool_argument_defaults",
                )
            if not isinstance(raw_defaults, Mapping):
                raise ApplicationError(
                    message=(
                        f"tool_argument_defaults['{raw_tool_name}'] must be an object of "
                        "argument_name -> value."
                    ),
                    status_code=400,
                    error_name="invalid_mcp_tool_argument_defaults",
                )

            tool_name = raw_tool_name.strip()
            defaults: dict[str, Any] = {}
            for raw_argument_name, default_value in raw_defaults.items():
                if (
                    not isinstance(raw_argument_name, str)
                    or not raw_argument_name.strip()
                ):
                    raise ApplicationError(
                        message=(
                            f"tool_argument_defaults['{tool_name}'] keys must be non-empty strings."
                        ),
                        status_code=400,
                        error_name="invalid_mcp_tool_argument_defaults",
                    )
                defaults[raw_argument_name.strip()] = default_value

            if defaults:
                normalized[tool_name] = defaults
        return normalized

    @staticmethod
    def _validate_tool_argument_defaults(document: DBMCPServer) -> None:
        raw_defaults = document.get("tool_argument_defaults")
        if not isinstance(raw_defaults, Mapping) or not raw_defaults:
            return

        tools_by_name = {
            str(tool.get("name", "")).strip(): tool
            for tool in document.get("tools", [])
            if isinstance(tool, Mapping) and isinstance(tool.get("name"), str)
        }

        for tool_name, defaults in raw_defaults.items():
            if not isinstance(tool_name, str) or not tool_name.strip():
                continue
            if not isinstance(defaults, Mapping) or not defaults:
                continue

            tool_snapshot = tools_by_name.get(tool_name)
            if tool_snapshot is None:
                raise ApplicationError(
                    message=(
                        f"tool_argument_defaults references unknown MCP tool '{tool_name}'."
                    ),
                    status_code=400,
                    error_name="invalid_mcp_tool_argument_defaults",
                )

            input_schema = tool_snapshot.get("input_schema")
            if not isinstance(input_schema, Mapping):
                raise ApplicationError(
                    message=(
                        f"MCP tool '{tool_name}' does not expose a compatible input schema "
                        "for tool_argument_defaults."
                    ),
                    status_code=400,
                    error_name="invalid_mcp_tool_argument_defaults",
                )

            properties = input_schema.get("properties")
            if not isinstance(properties, Mapping):
                raise ApplicationError(
                    message=(
                        f"MCP tool '{tool_name}' does not expose top-level properties for "
                        "tool_argument_defaults."
                    ),
                    status_code=400,
                    error_name="invalid_mcp_tool_argument_defaults",
                )

            for argument_name in defaults:
                if argument_name not in properties:
                    raise ApplicationError(
                        message=(
                            f"tool_argument_defaults references unknown argument "
                            f"'{argument_name}' for MCP tool '{tool_name}'."
                        ),
                        status_code=400,
                        error_name="invalid_mcp_tool_argument_defaults",
                    )

    @staticmethod
    def _normalize_object_id(value: str, *, field_name: str) -> str:
        normalized = value.strip()
        if not normalized or not ObjectId.is_valid(normalized):
            raise ApplicationError(
                message=f"Invalid {field_name} value '{value}'.",
                status_code=400,
                error_name="invalid_object_id",
            )
        return normalized

    @staticmethod
    def _to_float(value: object) -> float | None:
        if isinstance(value, (int, float)):
            return float(value)
        return None

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)
