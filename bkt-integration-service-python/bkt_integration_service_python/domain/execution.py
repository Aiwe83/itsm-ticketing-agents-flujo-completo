"""Formas de datos de ejecucion, equivalentes a src/models/Execution.model.ts
(ExecutionError, ExecutionTicket, OrchestratorResponseTrace)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


@dataclass
class ExecutionError:
    function: str
    error_message: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        return {
            "function": self.function,
            "errorMessage": self.error_message,
            "timestamp": self.timestamp,
        }


@dataclass
class ExecutionTicket:
    issue_jira_id: str
    key: str
    transformed_ticket_id: str
    success: bool = False
    error_list: list[ExecutionError] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "issueJiraId": self.issue_jira_id,
            "key": self.key,
            "transformedTicketId": self.transformed_ticket_id,
            "success": self.success,
            "errorList": [error.to_dict() for error in self.error_list],
        }


@dataclass
class OrchestratorResponseTrace:
    # UUID propio del documento persistido en `tickets` (ver ticket_repository.py),
    # no la clave de Jira - pero el nombre de campo en la traza (executions.
    # orchestratorResponses) se mantiene igual que antes (execution.repository.ts
    # no cambio su forma), solo cambia de donde viene el valor.
    ticket_document_id: str
    stored_ticket_id: str
    success: bool
    status_code: int | None = None
    response_body: Any = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "ticketId": self.ticket_document_id,
            "storedTicketId": self.stored_ticket_id,
            "success": self.success,
        }
        if self.status_code is not None:
            result["statusCode"] = self.status_code
        if self.response_body is not None:
            result["responseBody"] = self.response_body
        return result


def build_execution_error(error: BaseException | str, origin: str) -> ExecutionError:
    """Equivalente a IssueService.buildExecutionError (src/services/issue.service.ts)."""

    if isinstance(error, BaseException):
        message = str(error) or error.__class__.__name__
    else:
        message = error
    return ExecutionError(function=origin, error_message=message)
