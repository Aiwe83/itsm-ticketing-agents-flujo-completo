"""Orquestacion principal, equivalente a src/services/issue.service.ts.

Incluye el enriquecido de adjuntos (AttachmentService/JiraAttachmentFetcher,
ver services/attachment_service.py y services/jira_attachment_fetcher.py),
portado el 2026-09-29 para completar la equivalencia de contrato con TS (ver
`contexto_para_proyectos/Comparativa_TS_vs_Python_bkt_integration_service_TICK-139.md`).
Sigue siendo relevante solo para el camino manual secundario (`BFC-2` via
`bkt-jira-forge`): el trigger automatico real (`bkt-jira-triggers`) nunca
envia `fields.attachment`, asi que `_enrich_ticket_with_attachments` es un
no-op en el camino principal (la lista de adjuntos sale vacia y se corta en
el primer `if`).

Comportamiento a preservar, no negociable:
- El dispatch al orquestador es "fire-and-forget": la respuesta HTTP 201 se
  construye y se devuelve SIN esperar a que termine el dispatch
  (`orchestratorDispatched` solo indica que se lanzo, no que tuvo exito;
  el exito real queda en Mongo `executions.successOrchestrator`).
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from bkt_integration_service_python.clients.agent_runtime_client import (
    AgentRuntimeClient,
    OrchestratorTicketPayload,
)
from bkt_integration_service_python.core.config import Settings
from bkt_integration_service_python.core.logging import logger
from bkt_integration_service_python.domain.execution import (
    ExecutionError,
    ExecutionTicket,
    OrchestratorResponseTrace,
    build_execution_error,
)
from bkt_integration_service_python.domain.mappings import transform_issue_payload
from bkt_integration_service_python.repositories.mongo.execution_repository import ExecutionRepository
from bkt_integration_service_python.repositories.mongo.itsm_ticket_repository import ITSMTicketRepository
from bkt_integration_service_python.repositories.mongo.mapping_repository import MappingRepository
from bkt_integration_service_python.repositories.mongo.ticket_repository import TicketRepository
from bkt_integration_service_python.services.attachment_service import AttachmentService

# Referencias a tasks en vuelo para que el garbage collector no las destruya
# mientras corren en segundo plano (pitfall conocido de asyncio.create_task).
_background_tasks: set[asyncio.Task] = set()


def _utc_iso(dt: datetime | None = None) -> str:
    value = dt or datetime.now(UTC)
    return value.isoformat().replace("+00:00", "Z")


class IssueService:
    def __init__(
        self,
        settings: Settings,
        mappings_repo: MappingRepository,
        itsm_tickets_repo: ITSMTicketRepository,
        executions_repo: ExecutionRepository,
        tickets_repo: TicketRepository,
        orchestrator_client: AgentRuntimeClient,
        attachment_service: AttachmentService,
    ) -> None:
        self._settings = settings
        self._mappings = mappings_repo
        self._itsm_tickets = itsm_tickets_repo
        self._executions = executions_repo
        self._tickets = tickets_repo
        self._orchestrator = orchestrator_client
        self._attachments = attachment_service

    async def process_issues(
        self,
        issues: list[dict[str, Any]],
        initiated_by: str | None,
        request_id: str | None,
    ) -> dict[str, Any]:
        normalized_initiator = (initiated_by or "").strip() or "api"
        start_time = datetime.now(UTC)
        execution_id = await self._executions.create_execution(
            initiated_by=normalized_initiator, start_time=start_time
        )

        tickets_processed = 0
        tickets_succeeded = 0
        tickets_failed = 0
        ticket_results: list[dict[str, Any]] = []

        for payload in issues:
            tickets_processed += 1
            now = datetime.now(UTC)
            ticket_key: str = payload["key"]
            stored_ticket_id = f"{self._settings.mesh_id}:{ticket_key}"
            raw_ticket_stored = False

            ticket_summary = ExecutionTicket(
                issue_jira_id=payload.get("id") or ticket_key,
                key=ticket_key,
                transformed_ticket_id=stored_ticket_id,
                success=False,
            )

            try:
                await self._itsm_tickets.upsert(
                    id_=stored_ticket_id,
                    mesh_id=self._settings.mesh_id,
                    content=payload,
                    status="persisted",
                )
                raw_ticket_stored = True

                mappings = await self._mappings.find_by_context(self._settings.mesh_id)
                transformed_issue = transform_issue_payload(payload, mappings, self._settings.mesh_id)

                stored_ticket = await self._tickets.upsert(
                    key=ticket_key,
                    content=transformed_issue.content,
                )
                if not stored_ticket:
                    raise RuntimeError(f"Processed ticket upsert returned no document for {ticket_key}")
                ticket_document_id: str = stored_ticket["_id"]

                await self._itsm_tickets.update_status(stored_ticket_id, "translated")

                ticket_summary.success = True
                await self._executions.add_ticket(execution_id, ticket_summary)
                ticket_results.append(
                    {
                        "key": ticket_key,
                        "issueJiraId": payload.get("id") or ticket_key,
                        "success": True,
                        "errors": [],
                        "issue": payload,
                        "transformedIssue": transformed_issue.to_dict(),
                        "storedTicketId": stored_ticket_id,
                        "ticketDocumentId": ticket_document_id,
                        "receivedAt": _utc_iso(now),
                    }
                )
                tickets_succeeded += 1
            except Exception as error:  # noqa: BLE001 - equivalente a catch(error) del TS
                error_details = [build_execution_error(error, "issueService.processIssues")]

                if raw_ticket_stored:
                    try:
                        await self._itsm_tickets.update_status(stored_ticket_id, "failed")
                    except Exception as status_error:  # noqa: BLE001
                        error_details.append(
                            build_execution_error(status_error, "itsmTicketRepository.updateStatus")
                        )

                ticket_summary.error_list.extend(error_details)
                for error_detail in error_details:
                    await self._executions.add_error(execution_id, error_detail)
                await self._executions.add_ticket(execution_id, ticket_summary)
                ticket_results.append(
                    {
                        "key": ticket_key,
                        "issueJiraId": payload.get("id") or ticket_key,
                        "success": False,
                        "errors": [e.to_dict() for e in error_details],
                        "issue": payload,
                        "receivedAt": _utc_iso(now),
                        "storedTicketId": stored_ticket_id,
                    }
                )
                tickets_failed += 1

        end_time = datetime.now(UTC)
        execution_time = round((end_time - start_time).total_seconds())
        success_integration = tickets_failed == 0
        await self._executions.update_integration_status(execution_id, success_integration)

        orchestrator_tickets = [
            OrchestratorTicketPayload(
                ticket_document_id=ticket["ticketDocumentId"],
                stored_ticket_id=ticket["storedTicketId"],
                ticket_context=ticket["transformedIssue"],
            )
            for ticket in ticket_results
            if ticket.get("success")
            and ticket.get("transformedIssue")
            and ticket.get("storedTicketId")
            and ticket.get("ticketDocumentId")
        ]

        orchestrator_dispatched = len(orchestrator_tickets) > 0
        if orchestrator_dispatched:
            await self._executions.set_dispatched_execution_ids(
                execution_id, [t.stored_ticket_id for t in orchestrator_tickets]
            )
            # Fire-and-forget: no se espera aqui (equivalente al `void
            # this.postProcessTickets(...)` del TS). La respuesta HTTP no
            # incluye el resultado real del dispatch.
            task = asyncio.create_task(
                self._post_process_tickets(execution_id, ticket_results, orchestrator_tickets, request_id)
            )
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)

        await self._executions.complete_execution(
            execution_id,
            end_time=end_time,
            execution_time=execution_time,
            tickets_processed=tickets_processed,
            tickets_succeeded=tickets_succeeded,
            tickets_failed=tickets_failed,
        )

        return {
            "executionId": execution_id,
            "summary": {
                "ticketsProcessed": tickets_processed,
                "ticketsSucceeded": tickets_succeeded,
                "ticketsFailed": tickets_failed,
                "successIntegration": success_integration,
                "orchestratorDispatched": orchestrator_dispatched,
            },
            "tickets": ticket_results,
        }

    async def _post_process_tickets(
        self,
        execution_id: str,
        ticket_results: list[dict[str, Any]],
        orchestrator_tickets: list[OrchestratorTicketPayload],
        request_id: str | None,
    ) -> None:
        """Equivalente a IssueService.postProcessTickets (TS): primero enriquece
        cada ticket con sus adjuntos (si trae alguno), despues despacha al
        orquestador. El orden importa: `orchestrator_tickets[i].ticket_context`
        referencia el MISMO dict que `ticket_results[i]["transformedIssue"]`,
        asi que si el enriquecido corre antes, el dispatch ya ve los
        `attachedDocuments` actualizados."""

        for ticket_result in ticket_results:
            if (
                not ticket_result.get("success")
                or not ticket_result.get("transformedIssue")
                or not ticket_result.get("storedTicketId")
            ):
                continue
            await self._enrich_ticket_with_attachments(execution_id, ticket_result)

        await self._dispatch_orchestrator(execution_id, orchestrator_tickets, request_id)

    async def _enrich_ticket_with_attachments(
        self, execution_id: str, ticket_result: dict[str, Any]
    ) -> None:
        raw_attachments = self._get_issue_attachments(ticket_result["issue"])
        if not isinstance(raw_attachments, list) or len(raw_attachments) == 0:
            return

        try:
            attached_documents = await self._attachments.process_attachments(
                raw_attachments, ticket_result.get("key")
            )

            transformed_issue = ticket_result.get("transformedIssue")
            if not transformed_issue or not ticket_result.get("storedTicketId"):
                return

            transformed_issue["content"]["attachedDocuments"] = attached_documents

            await self._tickets.upsert(key=ticket_result["key"], content=transformed_issue["content"])

            for skipped in attached_documents:
                skipped_reason = skipped.get("skippedReason")
                if not skipped_reason:
                    continue
                await self._executions.add_error(
                    execution_id,
                    build_execution_error(
                        f"Attachment {skipped['filename']} skipped: {skipped_reason}",
                        "attachmentService.processAttachments",
                    ),
                )
        except Exception as error:  # noqa: BLE001 - equivalente a catch(error) del TS
            await self._executions.add_error(
                execution_id, build_execution_error(error, "attachmentService.processAttachments")
            )

    def _get_issue_attachments(self, payload: dict[str, Any]) -> Any:
        fields = payload.get("fields") or {}
        return fields.get("attachment") or fields.get("attachments") or []

    async def _dispatch_orchestrator(
        self,
        execution_id: str,
        orchestrator_tickets: list[OrchestratorTicketPayload],
        request_id: str | None,
    ) -> None:
        try:
            results = await self._orchestrator.notify_tickets(orchestrator_tickets, request_id)
            await self._executions.set_orchestrator_responses(
                execution_id,
                [
                    OrchestratorResponseTrace(
                        ticket_document_id=r.ticket_document_id,
                        stored_ticket_id=r.stored_ticket_id,
                        success=r.success,
                        status_code=r.status_code,
                        response_body=r.response_body,
                    )
                    for r in results
                ],
            )

            for result in results:
                if result.success:
                    continue
                error_detail = build_execution_error(
                    result.error_message or f"Orchestrator request failed with status {result.status_code}",
                    "orchestratorService.notifyTickets",
                )
                await self._executions.add_error(execution_id, error_detail)
                await self._executions.append_ticket_error(execution_id, result.stored_ticket_id, error_detail)

            success_orchestrator = len(results) == len(orchestrator_tickets) and all(r.success for r in results)
            await self._executions.update_orchestrator_status(execution_id, success_orchestrator)
        except Exception as error:  # noqa: BLE001
            logger.error(f"Failed to trace ticket post-processing for execution={execution_id}: {error}")
            await self._executions.add_error(
                execution_id, build_execution_error(error, "issueService.dispatchOrchestrator")
            )
            await self._executions.update_orchestrator_status(execution_id, False)
