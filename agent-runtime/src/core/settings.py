from __future__ import annotations

from functools import lru_cache
from typing import Any, Mapping

import msgspec

from core.settings_loader import (
    CommentedStruct,
    Field,
    _compile_struct_schema,
    _get_struct_schema,
    _Settings,
)

API_V1_PREFIX = "/api/v1"


class ServerSettings(CommentedStruct):
    debug: bool = False


class LoggingSettings(CommentedStruct):
    level: str = "INFO"
    json_logs: bool = False


class MongoDBSettings(CommentedStruct):
    dsn: str | None = None
    server_selection_timeout_ms: int = 3000

    @property
    def configured(self) -> bool:
        return bool(self.dsn)


class RedisSettings(CommentedStruct):
    url: str | None = None
    key_prefix: str = "agentic-core"
    socket_timeout_seconds: int = 5
    healthcheck_interval_seconds: int = 30

    @property
    def configured(self) -> bool:
        return bool(self.url)


class AuthSettings(CommentedStruct):
    encryption_key: str | None = None


class ObservabilitySettings(CommentedStruct):
    otlp_endpoint: str = "http://localhost:6006"
    service_name: str | None = None


class AgentRuntimeSettings(CommentedStruct):
    profiling_enabled: bool = False
    slow_log_threshold_ms: int = 1000
    max_total_runtime_seconds: int = 90
    max_agent_steps: int = 16
    max_tool_calls: int = 32
    max_parallel_tool_calls: int = 4


class OrchestratorSettings(CommentedStruct):
    default_model: str | None = None
    instructions: str | None = None


class AppSettings(_Settings, kw_only=True):
    app_name: str = "agentic-core"
    app_version: str = "0.1.0"
    environment: str = "local"
    server: ServerSettings
    logging: LoggingSettings
    mongodb: MongoDBSettings
    auth: AuthSettings = msgspec.field(default_factory=AuthSettings)
    redis: RedisSettings = msgspec.field(default_factory=RedisSettings)
    observability: ObservabilitySettings
    agent_runtime: AgentRuntimeSettings = msgspec.field(
        default_factory=AgentRuntimeSettings
    )
    orchestrator: OrchestratorSettings = msgspec.field(
        default_factory=OrchestratorSettings
    )

    model_config = {
        "env_prefix": "",
        "case_sensitive": False,
        "env_nested_delimiter": "__",
        "env_file": ".env",
    }


Settings = AppSettings


def load_settings(
    *,
    env: Mapping[str, str] | None = None,
    overrides: Mapping[str, Any] | None = None,
) -> AppSettings:
    return AppSettings.load(env=env, overrides=overrides)


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return load_settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()


def __getattr__(name: str) -> Any:
    if name == "settings":
        return get_settings()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "API_V1_PREFIX",
    "AgentRuntimeSettings",
    "AppSettings",
    "AuthSettings",
    "CommentedStruct",
    "Field",
    "LoggingSettings",
    "MongoDBSettings",
    "ObservabilitySettings",
    "OrchestratorSettings",
    "RedisSettings",
    "ServerSettings",
    "Settings",
    "_Settings",
    "_compile_struct_schema",
    "_get_struct_schema",
    "clear_settings_cache",
    "get_settings",
    "load_settings",
]
