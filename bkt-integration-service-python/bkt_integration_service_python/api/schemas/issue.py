"""Validacion del payload de entrada, equivalente a src/validators/issue.validator.ts.

Solo `key` y `fields.summary` son obligatorios (Jira real, via bkt-jira-triggers,
no manda description/assignee/components/attachment). El resto del payload pasa
intacto (equivalente al `.passthrough()` de Zod): se necesita el eco completo
en la respuesta 201 (`tickets[].issue`).
"""

from __future__ import annotations

from typing import Any, TypedDict

from bkt_integration_service_python.core.errors import AppError

ID_MAX = 128
SHORT_TEXT_MAX = 500
INITIATED_BY_MAX = 200


class IssueBatch(TypedDict):
    initiated_by: str | None
    issues: list[dict[str, Any]]


def _is_non_empty_str(value: Any, max_len: int) -> bool:
    return isinstance(value, str) and 0 < len(value) <= max_len


def _validate_issue_payload(issue: Any, index: int) -> dict[str, Any]:
    if not isinstance(issue, dict):
        raise AppError.validation(f"issues[{index}] must be an object")

    key = issue.get("key")
    if not _is_non_empty_str(key, ID_MAX):
        raise AppError.validation(
            f"issues[{index}].key is required",
            {"targetField": f"issues[{index}].key"},
        )

    fields = issue.get("fields")
    if not isinstance(fields, dict):
        raise AppError.validation(
            f"issues[{index}].fields is required",
            {"targetField": f"issues[{index}].fields"},
        )

    summary = fields.get("summary")
    if not _is_non_empty_str(summary, SHORT_TEXT_MAX):
        raise AppError.validation(
            f"issues[{index}].fields.summary is required",
            {"targetField": f"issues[{index}].fields.summary"},
        )

    issue_id = issue.get("id")
    if issue_id is not None and not _is_non_empty_str(issue_id, ID_MAX):
        raise AppError.validation(
            f"issues[{index}].id must be a non-empty string when present",
            {"targetField": f"issues[{index}].id"},
        )

    return issue


def validate_issue_batch(body: Any) -> IssueBatch:
    """Equivalente a issueBatchSchema.parse(...). Lanza AppError.validation (400)
    ante cualquier incumplimiento del contrato."""

    if not isinstance(body, dict):
        raise AppError.validation("Request body must be a JSON object")

    initiated_by = body.get("initiatedBy")
    if initiated_by is not None and not _is_non_empty_str(initiated_by, INITIATED_BY_MAX):
        raise AppError.validation(
            "initiatedBy must be a non-empty string when present",
            {"targetField": "initiatedBy"},
        )

    issues = body.get("issues")
    if not isinstance(issues, list) or len(issues) != 1:
        raise AppError.validation(
            "issues must be an array with exactly 1 item",
            {"targetField": "issues"},
        )

    validated_issues = [_validate_issue_payload(issue, i) for i, issue in enumerate(issues)]

    return IssueBatch(initiated_by=initiated_by, issues=validated_issues)
