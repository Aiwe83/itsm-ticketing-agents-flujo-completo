"""Fixtures compartidas por tests/integration/ y tests/contract/.

Estos tests golpean el servicio Python **ya desplegado** (puerto 8002) y su
Mongo real en Docker (puerto 27019) tal como pide el plan de migracion
(HANDOFF.md seccion 8, item 10: "tests de integracion, Mongo real en
Docker"). No levantan un servidor propio ni mockean Mongo: requieren que
`docker compose up -d` este corriendo en `bkt-integration-service-python/`.
Si no lo esta, los tests se saltan (skip) en vez de fallar en rojo.

Las credenciales se leen del contenedor ya corriendo (nunca se imprimen);
ver `_read_container_env`.
"""

from __future__ import annotations

import subprocess
import time
import uuid
from collections.abc import Generator

import httpx
import pytest
from pymongo import MongoClient
from pymongo.synchronous.database import Database

BASE_URL = "http://localhost:8002"
MONGO_HOST = "localhost"
MONGO_PORT = 27019
MONGO_DATABASE = "bkt-integration-service"
APP_CONTAINER = "bkt-integration-service-python"


def _read_container_env(container: str, name: str) -> str:
    """Lee una variable de entorno del contenedor ya corriendo (nunca la
    imprime). Las credenciales de Mongo de este stack se resuelven via
    defaults de `docker-compose.yaml` (`${MONGODB_USERNAME:-local}`), no
    estan como lineas planas en `.env`, asi que leerlas del contenedor es
    la fuente de verdad real, igual que se hizo toda la sesion manualmente."""

    result = subprocess.run(
        ["docker", "exec", container, "printenv", name],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


@pytest.fixture(scope="session")
def api_key() -> str:
    return _read_container_env(APP_CONTAINER, "API_KEY")


@pytest.fixture(scope="session")
def mongo_credentials() -> tuple[str, str]:
    return (
        _read_container_env(APP_CONTAINER, "MONGODB_USERNAME"),
        _read_container_env(APP_CONTAINER, "MONGODB_PASSWORD"),
    )


@pytest.fixture(scope="session")
def mongo_db(mongo_credentials: tuple[str, str]) -> Generator[Database, None, None]:
    username, password = mongo_credentials
    client: MongoClient = MongoClient(
        host=MONGO_HOST,
        port=MONGO_PORT,
        username=username,
        password=password,
        authSource="admin",
        serverSelectionTimeoutMS=5000,
    )
    try:
        client.admin.command("ping")
    except Exception as exc:  # pragma: no cover - guardia de entorno
        pytest.skip(f"Mongo real no disponible en {MONGO_HOST}:{MONGO_PORT}: {exc}")
    yield client[MONGO_DATABASE]
    client.close()


@pytest.fixture(scope="session")
def http_client(api_key: str) -> Generator[httpx.Client, None, None]:
    client = httpx.Client(base_url=BASE_URL, headers={"x-api-key": api_key}, timeout=15.0)
    try:
        resp = client.get("/health")
    except httpx.ConnectError as exc:  # pragma: no cover - guardia de entorno
        pytest.skip(f"Servicio Python no disponible en {BASE_URL}: {exc}")
    if resp.status_code != 200:  # pragma: no cover - guardia de entorno
        pytest.skip(f"/health de {BASE_URL} no respondio 200: {resp.status_code}")
    yield client
    client.close()


@pytest.fixture
def synthetic_key() -> str:
    """Clave de ticket unica por test, con prefijo reconocible para limpieza."""

    return f"TEST-INTEGRATION-{uuid.uuid4().hex[:12]}"


@pytest.fixture
def cleanup_ticket(mongo_db: Database) -> Generator[list[str], None, None]:
    """Registra claves creadas durante el test y las borra al terminar,
    en las 3 colecciones que pueden llevarlas (no toca mappings ni datos
    reales del meshId con otras claves)."""

    keys: list[str] = []
    yield keys
    if not keys:
        return
    mongo_db.tickets.delete_many({"key": {"$in": keys}})
    mongo_db.itsm_tickets.delete_many({"content.key": {"$in": keys}})
    mongo_db.executions.delete_many({"ticketList.key": {"$in": keys}})


def issue_payload(key: str, **field_overrides: object) -> dict:
    fields = {
        "summary": f"Test de integracion {key}",
        "issuetype": {"name": "Consulta"},
        "status": {"name": "Recibida"},
        "priority": {"name": "Medium"},
    }
    fields.update(field_overrides)
    return {
        "initiatedBy": "pytest-integration",
        "issues": [{"id": f"int-{key}", "key": key, "fields": fields}],
    }


def wait_for_execution(mongo_db: Database, key: str, timeout: float = 5.0) -> dict | None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        doc = mongo_db.executions.find_one({"ticketList.key": key})
        if doc is not None:
            return doc
        time.sleep(0.2)
    return None
