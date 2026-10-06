"""Tests de integracion del flujo completo POST /api/v1/issues contra el
servicio Python real y su Mongo real en Docker (ver conftest.py). Cubren lo
que HANDOFF.md (seccion 8, item 10) marcaba como pendiente: persistencia
real en las 3 colecciones, upsert idempotente, y los 2 caminos de error
(401 / 400) contra el servicio desplegado, no mockeado."""

from __future__ import annotations

import httpx
from pymongo.synchronous.database import Database

from tests.conftest import issue_payload, wait_for_execution


def test_health_reports_database_connected(http_client: httpx.Client) -> None:
    resp = http_client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["message"] == "OK"
    assert body["database"] == "connected"


def test_post_issues_persists_across_three_collections(
    http_client: httpx.Client, mongo_db: Database, synthetic_key: str, cleanup_ticket: list[str]
) -> None:
    cleanup_ticket.append(synthetic_key)

    resp = http_client.post("/api/v1/issues", json=issue_payload(synthetic_key))

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["summary"]["ticketsSucceeded"] == 1
    assert body["data"]["summary"]["ticketsFailed"] == 0

    ticket = body["data"]["tickets"][0]
    assert ticket["key"] == synthetic_key
    assert ticket["success"] is True
    assert ticket["transformedIssue"]["content"]["key"] == synthetic_key

    itsm_doc = mongo_db.itsm_tickets.find_one({"content.key": synthetic_key})
    assert itsm_doc is not None
    assert itsm_doc["status"] == "translated"
    assert "createdAt" in itsm_doc
    assert "updatedAt" in itsm_doc

    ticket_doc = mongo_db.tickets.find_one({"key": synthetic_key})
    assert ticket_doc is not None
    assert ticket_doc["content"]["key"] == synthetic_key
    assert "createdAt" in ticket_doc
    assert "updatedAt" in ticket_doc

    execution_doc = wait_for_execution(mongo_db, synthetic_key)
    assert execution_doc is not None
    assert execution_doc["successIntegration"] is True
    assert execution_doc["ticketList"][0]["key"] == synthetic_key


def test_post_issues_same_key_twice_upserts_not_duplicates(
    http_client: httpx.Client, mongo_db: Database, synthetic_key: str, cleanup_ticket: list[str]
) -> None:
    cleanup_ticket.append(synthetic_key)

    first = http_client.post("/api/v1/issues", json=issue_payload(synthetic_key, summary="Primera version"))
    assert first.status_code == 201
    first_doc_id = mongo_db.tickets.find_one({"key": synthetic_key})["_id"]

    second = http_client.post(
        "/api/v1/issues", json=issue_payload(synthetic_key, summary="Segunda version (upsert)")
    )
    assert second.status_code == 201

    matching_docs = list(mongo_db.tickets.find({"key": synthetic_key}))
    assert len(matching_docs) == 1, "el upsert debe actualizar el mismo documento, no crear uno nuevo"
    assert matching_docs[0]["_id"] == first_doc_id, "el _id debe mantenerse estable entre upserts"
    assert matching_docs[0]["content"]["summary"] == "Segunda version (upsert)"
    assert matching_docs[0]["createdAt"] != matching_docs[0]["updatedAt"], (
        "updatedAt debe avanzar en el segundo upsert mientras createdAt se mantiene"
    )


def test_post_issues_wrong_api_key_returns_401(synthetic_key: str) -> None:
    with httpx.Client(base_url="http://localhost:8002", timeout=15.0) as client:
        resp = client.post(
            "/api/v1/issues",
            json=issue_payload(synthetic_key),
            headers={"x-api-key": "clave-invalida-a-proposito"},
        )
    assert resp.status_code == 401


def test_post_issues_missing_required_field_returns_400(
    http_client: httpx.Client, synthetic_key: str
) -> None:
    payload = {
        "initiatedBy": "pytest-integration",
        "issues": [{"id": f"int-{synthetic_key}", "key": synthetic_key, "fields": {}}],
    }

    resp = http_client.post("/api/v1/issues", json=payload)

    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "VALIDATION_ERROR"
