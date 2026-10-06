"""Cliente hacia agent-runtime, equivalente a src/services/orchestrator.service.ts.

Contrato ya cerrado del lado de agent-runtime: POST /api/v1/orchestrator/dispatch
con {rol, ticket_id, mesh_id, execution_id, ticket_context?}. SIN REINTENTOS
(el TS original usa `retry: {limit: 0}`) y timeout desde ORCHESTRATOR_TIMEOUT_MS.
No anadir reintentos "por seguridad": cambiaria el comportamiento observable y
podria duplicar dispatches.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx

from bkt_integration_service_python.core.config import Settings
from bkt_integration_service_python.core.logging import logger


@dataclass
class OrchestratorTicketPayload:
    # UUID propio del documento persistido en `tickets` (ver ticket_repository.py),
    # ya no la clave de Jira. execution_id (stored_ticket_id) sigue siendo
    # meshId:key - son ids distintos, no confundir.
    ticket_document_id: str
    stored_ticket_id: str
    ticket_context: dict[str, Any] | None = None


@dataclass
class OrchestratorResult:
    ticket_document_id: str
    stored_ticket_id: str
    success: bool
    error_message: str | None = None
    status_code: int | None = None
    response_body: Any = None


class AgentRuntimeClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._url = self._build_url(settings.orchestrator_base_url, settings.orchestrator_endpoint)
        self._timeout = settings.orchestrator_timeout_ms / 1000

    @staticmethod
    def _build_url(base_url: str, endpoint: str) -> str:
        return f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"

    def _serialize_payload(self, ticket: OrchestratorTicketPayload) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "rol": self._settings.orchestrator_role,
            "ticket_id": ticket.ticket_document_id,
            "mesh_id": self._settings.mesh_id,
            "execution_id": ticket.stored_ticket_id,
        }
        if ticket.ticket_context is not None:
            payload["ticket_context"] = ticket.ticket_context
        return payload

    @staticmethod
    def _is_successful(status_code: int, body: Any) -> bool:
        if status_code < 200 or status_code >= 300:
            return False
        if not isinstance(body, dict):
            return True
        if body.get("success") is False:
            return False
        response = body.get("response")
        if isinstance(response, dict):
            response_status = response.get("status")
            if isinstance(response_status, str) and response_status != "completed":
                return False
        return True

    async def notify_tickets(
        self, tickets: list[OrchestratorTicketPayload], request_id: str | None = None
    ) -> list[OrchestratorResult]:
        if not tickets:
            return []

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            results = await asyncio.gather(
                *(self._notify_one(client, ticket, request_id) for ticket in tickets)
            )
        return list(results)

    async def _notify_one(
        self, client: httpx.AsyncClient, ticket: OrchestratorTicketPayload, request_id: str | None
    ) -> OrchestratorResult:
        headers = {"X-Request-Id": request_id} if request_id else {}
        payload = self._serialize_payload(ticket)
        try:
            response = await client.post(self._url, json=payload, headers=headers)
            body: Any
            try:
                body = response.json()
            except ValueError:
                body = None
            return OrchestratorResult(
                ticket_document_id=ticket.ticket_document_id,
                stored_ticket_id=ticket.stored_ticket_id,
                success=self._is_successful(response.status_code, body),
                status_code=response.status_code,
                response_body=body,
            )
        except httpx.HTTPError as error:
            logger.warning(f"Orchestrator request failed for {ticket.ticket_document_id}: {error}")
            return OrchestratorResult(
                ticket_document_id=ticket.ticket_document_id,
                stored_ticket_id=ticket.stored_ticket_id,
                success=False,
                error_message=str(error),
            )
