from __future__ import annotations

import json
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypedDict, cast, get_type_hints

if TYPE_CHECKING:
    from langchain.tools import ToolRuntime

from langchain.tools import ToolRuntime
from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool
from langgraph.types import Command

from core.errors.base import ApplicationError
from models.agent import (
    ResponseToolCallCompletedEvent,
    ResponseToolStreamDeltaEvent,
    ToolResultEntry,
)
from utils.usage import add_usages, coerce_usage_mapping

_AGENT_HIDDEN_LOCATION_KEYS = {"file_route"}


class AskUserOption(TypedDict, total=False):
    id: str
    label: str
    description: str | None


class AskUserResult(TypedDict, total=False):
    ok: bool
    kind: str
    request_id: str
    question: str
    options: list[AskUserOption]
    selection_mode: str
    allow_free_text: bool
    placeholder: str | None


class PythonSandboxArtifact(TypedDict):
    name: str
    size_bytes: int
    mime_type: str | None


class PythonSandboxExecutionLimits(TypedDict, total=False):
    timeout_seconds: int
    dependency_install_timeout_seconds: int
    max_dependencies: int
    memory_bytes: int
    stdout_limit_bytes: int
    stderr_limit_bytes: int
    artifact_limit_bytes: int
    network_disabled: bool
    pip_install_allowlist: list[str]
    import_whitelist: list[str]
    isolated_subprocess: bool


class PythonSandboxDependencyInstall(TypedDict):
    attempted: bool
    exit_code: int | None
    timed_out: bool
    duration_ms: int
    stdout: str
    stderr: str


class PythonSandboxResult(TypedDict, total=False):
    ok: bool
    stdout: str
    stderr: str
    exit_code: int | None
    timed_out: bool
    duration_ms: int
    artifacts: list[PythonSandboxArtifact]
    execution_limits: PythonSandboxExecutionLimits
    requested_dependencies: list[str]
    installed_dependencies: list[str]
    dependency_install: PythonSandboxDependencyInstall
    warnings: list[str]
    errors: list[ToolErrorItem]


class ToolErrorItem(TypedDict, total=False):
    scope: str
    query:str
    error_code: str
    error_type: str
    error_message: str
    status_code: int
    extra: dict[str, Any]


ToolResultsMap = dict[str, list[ToolResultEntry[Any]]]
ToolUsageMap = dict[str, dict[str, Any]]


def mark_runtime_injected_arg(tool: BaseTool) -> BaseTool:
    """Ensure LangChain preserves ToolNode-injected runtime through args_schema parsing."""
    coroutine = getattr(tool, "coroutine", None)
    if coroutine is None:
        return tool

    try:
        type_hints = get_type_hints(coroutine, include_extras=True)
    except Exception:
        return tool

    if type_hints.get("runtime") is not ToolRuntime:
        return tool

    injected_keys = getattr(tool, "_injected_args_keys", frozenset())
    if "runtime" not in injected_keys:
        setattr(tool, "_injected_args_keys", frozenset((*injected_keys, "runtime")))
    return tool


def _upsert_tool_result_entry(
    tool_results: ToolResultsMap,
    *,
    tool_name: str,
    entry: ToolResultEntry[Any],
) -> None:
    entries = tool_results.setdefault(tool_name, [])
    for index, existing_entry in enumerate(entries):
        if existing_entry["tool_call_id"] == entry["tool_call_id"]:
            entries[index] = entry
            return
    entries.append(entry)


def get_tool_result_history(
    state: Mapping[str, Any] | dict[str, Any],
) -> ToolResultsMap:
    raw_tool_results = state.get("tool_results")
    if not isinstance(raw_tool_results, Mapping):
        return {}

    normalized: ToolResultsMap = {}
    for tool_name, entries in raw_tool_results.items():
        if (
            not isinstance(tool_name, str)
            or not tool_name
            or not isinstance(entries, list)
        ):
            continue
        normalized_entries: list[ToolResultEntry[Any]] = []
        for item in entries:
            if not isinstance(item, Mapping):
                continue
            tool_call_id = item.get("tool_call_id")
            if not isinstance(tool_call_id, str) or not tool_call_id:
                continue
            normalized_entries.append(
                {
                    "tool_call_id": tool_call_id,
                    "result": item.get("result"),
                }
            )
        if normalized_entries:
            normalized[tool_name] = normalized_entries
    return normalized


def get_tool_results(state: Mapping[str, Any] | dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for tool_name, entries in get_tool_result_history(state).items():
        if not entries:
            continue
        normalized[tool_name] = entries[-1]["result"]
    return normalized


def get_tool_usage_history(
    state: Mapping[str, Any] | dict[str, Any],
) -> ToolUsageMap:
    raw_tool_usage = state.get("tool_usage")
    if not isinstance(raw_tool_usage, Mapping):
        return {}

    normalized: ToolUsageMap = {}
    for tool_name, usage in raw_tool_usage.items():
        if not isinstance(tool_name, str) or not tool_name:
            continue
        if not isinstance(usage, Mapping):
            continue
        normalized_usage = coerce_usage_mapping(usage)
        if normalized_usage:
            normalized[tool_name] = normalized_usage
    return normalized


def build_tool_state_update(
    *,
    runtime: ToolRuntime,
    tool_name: str,
    result: Mapping[str, Any] | dict[str, Any],
    tool_message: ToolMessage,
    usage: dict[str, Any] | None = None,
) -> dict[str, Any]:
    update_payload: dict[str, Any] = {
        "messages": [tool_message],
        "tool_results": {
            tool_name: [
                {
                    "tool_call_id": str(runtime.tool_call_id),
                    "result": result,
                }
            ]
        },
    }
    if usage:
        update_payload["tool_usage"] = {tool_name: dict(usage)}
    return update_payload


def _sanitize_tool_payload_for_agent(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            if key in _AGENT_HIDDEN_LOCATION_KEYS:
                continue
            sanitized[key] = _sanitize_tool_payload_for_agent(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_tool_payload_for_agent(item) for item in value]
    return value


def build_agent_safe_tool_message_content(
    result_payload: Mapping[str, Any] | dict[str, Any],
    *,
    summary_message: str | None = None,
) -> str:
    sanitized = _sanitize_tool_payload_for_agent(dict(result_payload))
    if summary_message is not None and isinstance(sanitized, dict):
        sanitized = dict(sanitized)
        sanitized["messages"] = [summary_message]
    return json.dumps(sanitized, ensure_ascii=False, default=str)


def emit_tool_stream_delta(
    *,
    runtime: ToolRuntime,
    tool_name: str,
    delta: str,
    extra_payload: Mapping[str, Any] | None = None,
) -> None:
    if not delta:
        return
    stream_writer = getattr(runtime, "stream_writer", None)
    if stream_writer is None:
        return
    payload: dict[str, Any] = {
        "type": "response.tool_stream.delta",
        "tool_call_id": runtime.tool_call_id,
        "name": tool_name,
        "delta": delta,
    }
    if extra_payload:
        for key, value in extra_payload.items():
            if key in {"type", "tool_call_id", "name", "delta"}:
                continue
            payload[key] = value
    stream_writer(cast(ResponseToolStreamDeltaEvent, payload))


def emit_tool_call_completed(
    *,
    runtime: ToolRuntime,
    tool_name: str,
    result: object,
    extra_payload: Mapping[str, Any] | None = None,
) -> None:
    stream_writer = getattr(runtime, "stream_writer", None)
    if stream_writer is None:
        return
    payload: dict[str, Any] = {
        "type": "response.tool_call.completed",
        "tool_call_id": cast(str, runtime.tool_call_id),
        "name": tool_name,
        "result": result,
    }
    if extra_payload:
        for key, value in extra_payload.items():
            if key in {"type", "tool_call_id", "name", "result"}:
                continue
            payload[key] = value
    stream_writer(cast(ResponseToolCallCompletedEvent[Any], payload))


def build_tool_error_command(
    *,
    tool_name: str,
    runtime: ToolRuntime,
    exc: Exception,
    error_scope: str = "tool",
    result_seed: dict[str, Any] | None = None,
    event_result_key: str | None = None,
) -> Command:
    if isinstance(exc, ApplicationError):
        simple_message = str(exc.message or f"Error ejecutando {tool_name}")
        error_code = str(exc.code or type(exc).__name__)
        error_type = type(exc).__name__
        status_code = exc.status_code
        extra = exc.extra
    else:
        simple_message = str(exc) or f"Error ejecutando {tool_name}"
        error_code = "ToolError"
        error_type = type(exc).__name__
        status_code = None
        extra = None

    error_item: ToolErrorItem = {
        "scope": error_scope,
        "error_code": error_code,
        "error_type": error_type,
        "error_message": simple_message,
    }
    if status_code is not None:
        error_item["status_code"] = status_code
    if extra is not None:
        error_item["extra"] = extra

    result_payload: dict[str, Any] = {}
    if result_seed:
        result_payload.update(result_seed)
    result_payload["ok"] = False
    result_payload["errors"] = [error_item]

    stream_writer = getattr(runtime, "stream_writer", None)
    tool_message = ToolMessage(
        content=build_agent_safe_tool_message_content(result_payload),
        tool_call_id=runtime.tool_call_id,
        name=tool_name,
    )

    if stream_writer:
        event_payload: dict[str, Any] = {
            "type": "response.tool_call.failed",
            "tool_call_id": runtime.tool_call_id,
            "name": tool_name,
            "error": {
                "code": error_code,
                "message": simple_message,
            },
        }
        stream_writer(event_payload)

    return Command(
        update=build_tool_state_update(
            runtime=runtime,
            tool_name=tool_name,
            result=result_payload,
            tool_message=tool_message,
        )
    )
