"""Tests de contrato: verifican la FORMA exacta de las respuestas HTTP contra
el servicio Python real, para que un cambio futuro que rompa el contrato
observable (el mismo que expone bkt-integration-service en TypeScript, ver
`contexto_para_proyectos/Comparativa_TS_vs_Python_bkt_integration_service_TICK-139.md`
para la comparacion campo a campo verificada el 2026-09-29) falle aqui antes
que en produccion. No verifican comportamiento (eso ya lo cubre
tests/integration/), solo presencia y tipo de cada campo."""

from __future__ import annotations

import httpx

from tests.conftest import issue_payload

HEALTH_REQUIRED_FIELDS: dict[str, type] = {
    "uptime": (int, float),
    "message": str,
    "timestamp": str,
    "environment": str,
    "database": str,
}

ISSUES_SUCCESS_TOP_LEVEL: dict[str, type] = {
    "success": bool,
    "message": str,
    "data": dict,
}

ISSUES_SUCCESS_SUMMARY: dict[str, type] = {
    "ticketsProcessed": int,
    "ticketsSucceeded": int,
    "ticketsFailed": int,
    "successIntegration": bool,
    "orchestratorDispatched": bool,
}

TICKET_RESULT_FIELDS: dict[str, type] = {
    "key": str,
    "issueJiraId": (str, type(None)),
    "success": bool,
    "errors": list,
    "issue": dict,
    "transformedIssue": dict,
    "storedTicketId": str,
    "ticketDocumentId": str,
    "receivedAt": str,
}


def _assert_shape(obj: dict, expected: dict[str, type | tuple[type, ...]]) -> None:
    for field, expected_type in expected.items():
        assert field in obj, f"falta el campo '{field}' en {obj.keys()}"
        assert isinstance(obj[field], expected_type), (
            f"'{field}' deberia ser {expected_type}, es {type(obj[field])}"
        )


def test_health_contract_shape(http_client: httpx.Client) -> None:
    resp = http_client.get("/health")
    assert resp.status_code == 200
    _assert_shape(resp.json(), HEALTH_REQUIRED_FIELDS)


def test_issues_success_contract_shape(
    http_client: httpx.Client, synthetic_key: str, cleanup_ticket: list[str]
) -> None:
    cleanup_ticket.append(synthetic_key)

    resp = http_client.post("/api/v1/issues", json=issue_payload(synthetic_key))
    assert resp.status_code == 201

    body = resp.json()
    _assert_shape(body, ISSUES_SUCCESS_TOP_LEVEL)
    _assert_shape(body["data"]["summary"], ISSUES_SUCCESS_SUMMARY)

    assert isinstance(body["data"]["tickets"], list)
    assert len(body["data"]["tickets"]) == 1
    _assert_shape(body["data"]["tickets"][0], TICKET_RESULT_FIELDS)

    transformed = body["data"]["tickets"][0]["transformedIssue"]
    assert "meshId" in transformed and isinstance(transformed["meshId"], str)
    assert "content" in transformed and isinstance(transformed["content"], dict)
    assert transformed["content"]["key"] == synthetic_key


def test_issues_validation_error_contract_shape(http_client: httpx.Client, synthetic_key: str) -> None:
    payload = {
        "initiatedBy": "pytest-contract",
        "issues": [{"id": f"contract-{synthetic_key}", "key": synthetic_key, "fields": {}}],
    }

    resp = http_client.post("/api/v1/issues", json=payload)
    assert resp.status_code == 400

    body = resp.json()
    assert body["success"] is False
    _assert_shape(
        body["error"],
        {"message": str, "code": str, "statusCode": int, "timestamp": str, "path": str},
    )


def test_issues_unauthorized_contract_shape(synthetic_key: str) -> None:
    with httpx.Client(base_url="http://localhost:8002", timeout=15.0) as client:
        resp = client.post(
            "/api/v1/issues",
            json=issue_payload(synthetic_key),
            headers={"x-api-key": "clave-invalida-a-proposito"},
        )
    assert resp.status_code == 401
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "UNAUTHORIZED"
