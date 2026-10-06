from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from bson import ObjectId

from core.errors import ApplicationError, ResourceNotFoundError
from models.agent import Agent, DBAgent, CreateAgentPayload, UpdateAgentPayload
from models.common import DeleteResult
from repositories.mongodb.agent import AgentRepository
from repositories.mongodb.mcp import MCPServerRepository
from services.base import BaseService


class AgentService(BaseService):
    def __init__(
        self,
        repository: AgentRepository,
        mcp_repository: MCPServerRepository,
    ) -> None:
        self._repository = repository
        self._mcp_repository = mcp_repository

    async def list_agents(self) -> tuple[Agent, ...]:
        try:
            documents = await self._repository.find_all()
            return tuple(self._to_model(document) for document in documents)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to list agents.",
                status_code=500,
                exception=exc,
                error_name="agent_query_error",
            ) from exc

    async def get_agent(self, agent_id: str) -> Agent:
        try:
            normalized_agent_id = self._normalize_object_id(
                agent_id,
                field_name="agent_id",
            )
            return self._to_model(await self._get_document(normalized_agent_id))
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to load agent.",
                status_code=500,
                exception=exc,
                error_name="agent_query_error",
            ) from exc

    async def create_agent(self, payload: CreateAgentPayload) -> Agent:
        try:
            name = self._normalize_name(payload.name)
            await self._ensure_name_available(name)
            mcp_ids = await self._validate_mcp_ids(payload.mcp_ids)
            now = self._utcnow()
            agent_id = await self._repository.insert_one(
                {
                    "name": name,
                    "description": self._normalize_optional_text(payload.description),
                    "instructions": self._normalize_optional_text(payload.instructions),
                    "mcp_ids": [ObjectId(mcp_id) for mcp_id in mcp_ids],
                    "enabled": payload.enabled,
                    "created_at": now,
                    "last_modified_at": now,
                }
            )
            return await self.get_agent(agent_id)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to create agent.",
                status_code=500,
                exception=exc,
                error_name="agent_mutation_error",
            ) from exc

    async def update_agent(
        self, agent_id: str, payload: UpdateAgentPayload
    ) -> Agent:
        try:
            document = await self._get_document(agent_id)
            update_fields: dict[str, Any] = {}

            if payload.name is not None:
                name = self._normalize_name(payload.name)
                existing = await self._repository.find_by_name(name)
                if existing is not None and str(existing.get("_id")) != str(document.get("_id")):
                    raise ApplicationError(
                        message=f"Agent name '{name}' is already in use.",
                        status_code=409,
                        error_name="agent_name_already_exists",
                    )
                update_fields["name"] = name

            if payload.description is not None:
                description = self._normalize_optional_text(payload.description)
                update_fields["description"] = description

            if payload.instructions is not None:
                update_fields["instructions"] = self._normalize_optional_text(payload.instructions)

            if payload.mcp_ids is not None:
                mcp_ids = await self._validate_mcp_ids(payload.mcp_ids)
                update_fields["mcp_ids"] = [ObjectId(mcp_id) for mcp_id in mcp_ids]

            if payload.enabled is not None:
                update_fields["enabled"] = payload.enabled

            if update_fields:
                update_fields["last_modified_at"] = self._utcnow()
                await self._repository.update_one(
                    {"_id": ObjectId(agent_id)},
                    {"$set": update_fields},
                )

            return await self.get_agent(agent_id)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to update agent.",
                status_code=500,
                exception=exc,
                error_name="agent_mutation_error",
            ) from exc

    async def delete_agent(self, agent_id: str) -> DeleteResult:
        try:
            await self._get_document(agent_id)
            deleted = await self._repository.delete_one({"_id": ObjectId(agent_id)})
            if not deleted:
                raise ResourceNotFoundError(f"Agent '{agent_id}' was not found.")
            return DeleteResult(id=agent_id, deleted=True)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to delete agent.",
                status_code=500,
                exception=exc,
                error_name="agent_mutation_error",
            ) from exc

    async def add_mcp_to_agent(self, agent_id: str, mcp_id: str) -> Agent:
        try:
            await self._get_document(agent_id)
            normalized_mcp_id = await self._validate_single_mcp_id(mcp_id)
            await self._repository.add_mcp(agent_id, normalized_mcp_id)
            await self._touch_agent(agent_id)
            return await self.get_agent(agent_id)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to add MCP to agent.",
                status_code=500,
                exception=exc,
                error_name="agent_mutation_error",
            ) from exc

    async def remove_mcp_from_agent(self, agent_id: str, mcp_id: str) -> Agent:
        try:
            await self._get_document(agent_id)
            normalized_mcp_id = self._normalize_object_id(mcp_id, field_name="mcp_id")
            await self._repository.remove_mcp(agent_id, normalized_mcp_id)
            await self._touch_agent(agent_id)
            return await self.get_agent(agent_id)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to remove MCP from agent.",
                status_code=500,
                exception=exc,
                error_name="agent_mutation_error",
            ) from exc

    async def _get_document(self, agent_id: str) -> DBAgent:
        normalized_agent_id = self._normalize_object_id(agent_id, field_name="agent_id")
        document = await self._repository.find_by_id(normalized_agent_id)
        if document is None:
            raise ResourceNotFoundError(f"Agent '{agent_id}' was not found.")
        return document

    async def _ensure_name_available(self, name: str) -> None:
        existing = await self._repository.find_by_name(name)
        if existing is not None:
            raise ApplicationError(
                message=f"Agent name '{name}' is already in use.",
                status_code=409,
                error_name="agent_name_already_exists",
            )

    async def _validate_single_mcp_id(self, mcp_id: str) -> str:
        normalized_mcp_ids = await self._validate_mcp_ids((mcp_id,))
        return normalized_mcp_ids[0]

    async def _validate_mcp_ids(self, mcp_ids: Sequence[str]) -> list[str]:
        normalized_mcp_ids = self._normalize_ids(mcp_ids, field_name="mcp_ids")
        if not normalized_mcp_ids:
            return []

        documents = await self._mcp_repository.find_enabled_by_ids(tuple(normalized_mcp_ids))
        mcps_by_id = {str(document.get("_id")): document for document in documents}
        validated_ids: list[str] = []
        for mcp_id in normalized_mcp_ids:
            if mcp_id not in mcps_by_id:
                raise ApplicationError(
                    message=f"MCP '{mcp_id}' was not found or is disabled.",
                    status_code=400,
                    error_name="invalid_agent_mcp",
                )
            validated_ids.append(mcp_id)
        return validated_ids

    async def _touch_agent(self, agent_id: str) -> None:
        await self._repository.update_one(
            {"_id": ObjectId(agent_id)},
            {"$set": {"last_modified_at": self._utcnow()}},
        )

    @staticmethod
    def _to_model(document: DBAgent) -> Agent:
        mcp_ids = document.get("mcp_ids") or []
        return Agent(
            id=str(document.get("_id", "")),
            name=str(document.get("name", "")),
            description=document.get("description"),
            instructions=document.get("instructions"),
            mcp_ids=tuple(str(mcp_id) for mcp_id in mcp_ids),
            enabled=bool(document.get("enabled", True)),
        )

    @staticmethod
    def _normalize_name(name: str) -> str:
        normalized = name.strip()
        if not normalized:
            raise ApplicationError(
                message="Agent name cannot be empty.",
                status_code=400,
                error_name="invalid_agent_name",
            )
        return normalized

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @classmethod
    def _normalize_ids(cls, values: Sequence[str], *, field_name: str) -> list[str]:
        normalized_ids: list[str] = []
        seen: set[str] = set()
        for raw_value in values:
            normalized_value = cls._normalize_object_id(raw_value, field_name=field_name)
            if normalized_value in seen:
                continue
            seen.add(normalized_value)
            normalized_ids.append(normalized_value)
        return normalized_ids
