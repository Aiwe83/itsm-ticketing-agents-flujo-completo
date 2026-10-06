"""Configuracion tipada, equivalente a src/config/environment.ts.

Misma politica que el TypeScript original: API_KEY es obligatoria y falla-cerrado
(sin default), el resto de variables opcionales tienen los mismos defaults.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


class ConfigError(RuntimeError):
    """Variable de entorno obligatoria ausente o invalida."""


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigError(f"{name} is required")
    return value


def _get(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def _get_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value in (None, ""):
        return default
    return int(value)


def _get_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value in (None, ""):
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    # App
    node_env: str
    port: int
    api_version: str
    app_name: str
    app_description: str
    health_check_path: str
    log_level: str
    log_pretty_print: bool

    # Mongo
    mongodb_username: str
    mongodb_password: str
    mongodb_host: str
    mongodb_database: str
    mongodb_max_pool_size: int
    mongodb_min_pool_size: int
    # NOTA (riesgo conocido, ver plan de migracion): el TS original hardcodea el
    # puerto 27017 (no existe MONGODB_PORT). Aqui SI se parametriza desde el
    # inicio para no heredar ese hardcode, pero el default reproduce el mismo
    # comportamiento observable si no se define la variable.
    mongodb_port: int

    # Auth
    api_key: str
    api_key_header: str

    # CORS / rate limit (no aplicados por Litestar en esta primera version;
    # se guardan tipados para no perder el contrato de configuracion)
    cors_origin: str
    cors_credentials: bool
    rate_limit_window_ms: int
    rate_limit_max_requests: int

    # Orquestador
    orchestrator_base_url: str
    orchestrator_endpoint: str
    orchestrator_role: str
    orchestrator_timeout_ms: int

    # Adjuntos / Jira (solo relevantes para el camino manual de bkt-jira-forge)
    attachment_bytes_limit: int
    jira_base_url: str | None
    jira_user: str | None
    jira_password: str | None

    # Mesh / colecciones
    mesh_id: str
    original_ticket_collection_name: str
    processed_ticket_collection_name: str
    executions_collection_name: str
    mappings_collection_name: str

    @property
    def is_development(self) -> bool:
        return self.node_env == "development"

    @property
    def is_production(self) -> bool:
        return self.node_env == "production"

    @property
    def is_local(self) -> bool:
        return self.node_env == "local"

    @property
    def mongodb_url(self) -> str:
        return (
            f"mongodb://{self.mongodb_username}:{self.mongodb_password}"
            f"@{self.mongodb_host}:{self.mongodb_port}/{self.mongodb_database}"
            "?authSource=admin"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        node_env=_get("NODE_ENV", "development"),
        port=_get_int("PORT", 8000),
        api_version=_get("API_VERSION", "v1"),
        app_name=_get("APP_NAME", "INTEGRATION-SERVICE"),
        app_description=_get("APP_DESCRIPTION", "Integration service for ITSM Torre de Control"),
        health_check_path=_get("HEALTH_CHECK_PATH", "/health"),
        log_level=_get("LOG_LEVEL", "info"),
        log_pretty_print=_get_bool("LOG_PRETTY_PRINT", False),
        mongodb_username=_require("MONGODB_USERNAME"),
        mongodb_password=_require("MONGODB_PASSWORD"),
        mongodb_host=_require("MONGODB_HOST"),
        mongodb_database=_require("MONGODB_DATABASE"),
        mongodb_max_pool_size=_get_int("MONGODB_MAX_POOL_SIZE", 10),
        mongodb_min_pool_size=_get_int("MONGODB_MIN_POOL_SIZE", 5),
        mongodb_port=_get_int("MONGODB_PORT", 27017),
        api_key=_require("API_KEY"),
        api_key_header=_get("API_KEY_HEADER", "X-API-KEY"),
        cors_origin=_get("CORS_ORIGIN", "*"),
        cors_credentials=_get_bool("CORS_CREDENTIALS", True),
        rate_limit_window_ms=_get_int("RATE_LIMIT_WINDOW_MS", 900_000),
        rate_limit_max_requests=_get_int("RATE_LIMIT_MAX_REQUESTS", 100),
        orchestrator_base_url=_require("ORCHESTRATOR_BASE_URL"),
        orchestrator_endpoint=_require("ORCHESTRATOR_ENDPOINT"),
        orchestrator_role=_get("ORCHESTRATOR_ROLE", "agentic-orchestrator-application"),
        orchestrator_timeout_ms=_get_int("ORCHESTRATOR_TIMEOUT_MS", 30_000),
        attachment_bytes_limit=_get_int("ATTACHMENT_BYTES_LIMIT", 4_194_304),
        jira_base_url=_get("JIRA_BASE_URL", "") or None,
        jira_user=_get("JIRA_USER", "") or None,
        jira_password=_get("JIRA_PASSWORD", "") or None,
        mesh_id=_require("MESH_ID"),
        original_ticket_collection_name=_require("ORIGINAL_TICKET_COLLECTION_NAME"),
        processed_ticket_collection_name=_require("PROCESSED_TICKET_COLLECTION_NAME"),
        executions_collection_name=_require("EXECUTIONS_COLLECTION_NAME"),
        mappings_collection_name=_require("MAPPINGS_COLLECTION_NAME"),
    )
