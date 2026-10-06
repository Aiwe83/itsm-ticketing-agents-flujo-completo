from __future__ import annotations

import json
from typing import Any

from bson import ObjectId

from core.errors import ApplicationError, ResourceNotFoundError
from core.settings import AppSettings
from models.agent import DBAgent
from models.chat import ConfiguredAgentChatRequest
from models.orchestrator import (
    OrchestratorDispatchPayload,
    OrchestratorDispatchResponse,
)
from repositories.mongodb.agent import AgentRepository
from repositories.mongodb.model import ModelRepository
from services.base import BaseService
from services.chat import ChatService


class OrchestratorDispatchService(BaseService):
    def __init__(
        self,
        *,
        settings: AppSettings,
        agent_repository: AgentRepository,
        model_repository: ModelRepository,
        chat_service: ChatService,
    ) -> None:
        self._settings = settings
        self._agent_repository = agent_repository
        self._model_repository = model_repository
        self._chat_service = chat_service

    async def dispatch(
        self,
        payload: OrchestratorDispatchPayload,
        *,
        request_id: str | None = None,
    ) -> OrchestratorDispatchResponse:
        normalized_payload = self._normalize_payload(payload)
        agent_document = await self._resolve_agent(normalized_payload.rol)
        agent_id = str(agent_document.get("_id", ""))
        agent_name = str(agent_document.get("name", ""))
        model = await self._resolve_model()
        chat_id = normalized_payload.execution_id

        metadata = {
            "source": "integration-service",
            "ticket_id": normalized_payload.ticket_id,
            "mesh_id": normalized_payload.mesh_id,
            "execution_id": normalized_payload.execution_id,
            "role": normalized_payload.rol,
        }
        if request_id:
            metadata["request_id"] = request_id

        chat_payload = ConfiguredAgentChatRequest(
            model=model,
            input=self._build_agent_input(normalized_payload, request_id=request_id),
            instructions=self._settings.orchestrator.instructions,
            chat_id=chat_id,
            metadata=metadata,
            stream=False,
        )
        response = await self._chat_service.chat_with_agent_response(
            agent_id,
            chat_payload,
        )
        response_status = response.get("status")
        if response_status != "completed":
            raise ApplicationError(
                message=(
                    "Orchestrator dispatch did not complete successfully "
                    f"(status={response_status or 'unknown'})."
                ),
                status_code=502,
                error_name="orchestrator_dispatch_incomplete",
            )

        return OrchestratorDispatchResponse(
            success=True,
            agent_id=agent_id,
            agent_name=agent_name,
            ticket_id=normalized_payload.ticket_id,
            mesh_id=normalized_payload.mesh_id,
            execution_id=normalized_payload.execution_id,
            chat_id=chat_id,
            model=model,
            response=response,
            metadata=metadata,
        )

    async def _resolve_agent(self, role: str) -> DBAgent:
        if ObjectId.is_valid(role):
            document = await self._agent_repository.find_by_id(role)
        else:
            document = await self._agent_repository.find_by_name(role)

        if document is None or not bool(document.get("enabled", True)):
            raise ResourceNotFoundError(
                f"Agent for orchestrator role '{role}' was not found."
            )
        return document

    async def _resolve_model(self) -> str:
        configured_model = self._normalize_optional_text(
            self._settings.orchestrator.default_model
        )
        if configured_model is not None:
            return configured_model

        enabled_models = await self._model_repository.find_enabled()
        if not enabled_models:
            raise ApplicationError(
                message=(
                    "No default orchestrator model is configured and no enabled "
                    "model exists."
                ),
                status_code=400,
                error_name="orchestrator_model_not_configured",
            )

        first_model = enabled_models[0]
        return str(first_model.get("model_id") or first_model.get("name") or "").strip()

    @classmethod
    def _normalize_payload(
        cls,
        payload: OrchestratorDispatchPayload,
    ) -> OrchestratorDispatchPayload:
        return OrchestratorDispatchPayload(
            rol=cls._normalize_required_text(payload.rol, field_name="rol"),
            ticket_id=cls._normalize_required_text(
                payload.ticket_id,
                field_name="ticket_id",
            ),
            mesh_id=cls._normalize_required_text(payload.mesh_id, field_name="mesh_id"),
            execution_id=cls._normalize_required_text(
                payload.execution_id,
                field_name="execution_id",
            ),
            ticket_context=payload.ticket_context,
        )

    @staticmethod
    def _build_agent_input(
        payload: OrchestratorDispatchPayload,
        *,
        request_id: str | None,
    ) -> str:
        parts = [
            "Procesa el ticket recibido desde el servicio de integracion.",
            "Usa el contexto traducido del ticket para proponer la siguiente accion del flujo.",
            f"Ticket: {payload.ticket_id}",
            f"Mesh: {payload.mesh_id}",
            f"Execution id: {payload.execution_id}",
            f"Rol solicitado: {payload.rol}",
        ]
        if request_id:
            parts.append(f"Request id: {request_id}")
        if payload.ticket_context:
            parts.append("Contexto traducido del ticket:")
            parts.append(json.dumps(payload.ticket_context, ensure_ascii=True, sort_keys=True))
        return "\n".join(parts)

    @staticmethod
    def _normalize_required_text(value: str, *, field_name: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ApplicationError(
                message=f"Field '{field_name}' cannot be empty.",
                status_code=400,
                error_name="invalid_orchestrator_payload",
            )
        return normalized

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None
