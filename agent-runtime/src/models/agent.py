from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import TYPE_CHECKING, Any, Annotated, Generic, Literal, NotRequired, TypeAlias, TypedDict, TypeVar

import msgspec
from bson import ObjectId
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

from models.openai_compatible.base import (
    ProviderName,
    ReasoningEffort,
    ResponsesReasoningSummary,
    Verbosity,
)
from models.openai_compatible.responses.input import ResponsesTextFormat
from models.openai_compatible.responses.messages import ResponseInput
from utils.usage import add_usages, coerce_usage_mapping

if TYPE_CHECKING:
    from tools import (
        PythonSandboxResult,
    )
else:
    PythonSandboxResult = dict[str, Any]

ToolName: TypeAlias = str
ResultT = TypeVar("ResultT", default=Any)


class DBAgent(TypedDict, total=False):
    _id: ObjectId | str
    name: str
    description: str | None
    instructions: str | None
    mcp_ids: list[ObjectId | str]
    enabled: bool
    created_at: datetime
    last_modified_at: datetime


class Agent(msgspec.Struct, frozen=True):
    id: str
    name: str
    description: str | None = None
    instructions: str | None = None
    mcp_ids: tuple[str, ...] = ()
    enabled: bool = True


class CreateAgentPayload(msgspec.Struct, frozen=True):
    name: str
    description: str | None = None
    instructions: str | None = None
    mcp_ids: tuple[str, ...] = ()
    enabled: bool = True


class UpdateAgentPayload(msgspec.Struct, frozen=True):
    name: str | None = None
    description: str | None = None
    instructions: str | None = None
    mcp_ids: tuple[str, ...] | None = None
    enabled: bool | None = None


class AgentReasoningConfig(msgspec.Struct, kw_only=True):
    effort: ReasoningEffort | None = None
    summary: ResponsesReasoningSummary | None = None


class AgentTextConfig(msgspec.Struct, kw_only=True):
    format: ResponsesTextFormat | None = None
    verbosity: Verbosity = "medium"


class AgentRequest(msgspec.Struct, kw_only=True):
    model: str
    provider: ProviderName | None = None
    input: ResponseInput = ""
    instructions: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    max_output_tokens: int | None = None
    reasoning: AgentReasoningConfig | None = None
    text: AgentTextConfig | None = None
    mcp_servers: list[str] | None = None
    chat_id: str | None = None
    metadata: dict[str, Any] | None = None

    @property
    def verbosity(self) -> Verbosity:
        return self.text.verbosity if self.text is not None else "medium"

    @property
    def response_format(self) -> ResponsesTextFormat | None:
        return self.text.format if self.text is not None else None

    @property
    def reasoning_effort(self) -> ReasoningEffort | None:
        return self.reasoning.effort if self.reasoning is not None else None

    @property
    def reasoning_summary(self) -> ResponsesReasoningSummary | None:
        return self.reasoning.summary if self.reasoning is not None else None


class ToolResultEntry(TypedDict, Generic[ResultT]):
    tool_call_id: str
    result: ResultT


AgentToolResult: TypeAlias = (
    ToolResultEntry[Any]
    | ToolResultEntry[PythonSandboxResult]
    | ToolResultEntry[dict[str, Any]]
)
AgentToolResults: TypeAlias = dict[ToolName, list[AgentToolResult]]


def _merge_tool_result_entries(
    left: list[ToolResultEntry[Any]],
    right: list[ToolResultEntry[Any]],
) -> list[ToolResultEntry[Any]]:
    merged = list(left)
    by_tool_call_id = {
        entry["tool_call_id"]: index
        for index, entry in enumerate(merged)
        if entry["tool_call_id"]
    }
    for entry in right:
        tool_call_id = entry["tool_call_id"]
        if not tool_call_id:
            continue
        current_index = by_tool_call_id.get(tool_call_id)
        normalized_entry: ToolResultEntry[Any] = {
            "tool_call_id": tool_call_id,
            "result": entry.get("result"),
        }
        if current_index is None:
            by_tool_call_id[tool_call_id] = len(merged)
            merged.append(normalized_entry)
            continue
        merged[current_index] = normalized_entry
    return merged


def merge_tool_results_state(
    left: object,
    right: object,
) -> dict[ToolName, list[ToolResultEntry[Any]]]:
    normalized_left = left if isinstance(left, dict) else {}
    normalized_right = right if isinstance(right, dict) else {}
    merged: dict[ToolName, list[ToolResultEntry[Any]]] = {
        str(tool_name): [
            {
                "tool_call_id": str(entry.get("tool_call_id")),
                "result": entry.get("result"),
            }
            for entry in entries
            if isinstance(entry, dict)
            and isinstance(entry.get("tool_call_id"), str)
            and str(entry.get("tool_call_id")).strip()
        ]
        for tool_name, entries in normalized_left.items()
        if isinstance(tool_name, str)
        and isinstance(entries, list)
    }
    for tool_name, entries in normalized_right.items():
        if not isinstance(tool_name, str) or not isinstance(entries, list):
            continue
        normalized_entries: list[ToolResultEntry[Any]] = [
            {
                "tool_call_id": str(entry.get("tool_call_id")),
                "result": entry.get("result"),
            }
            for entry in entries
            if isinstance(entry, dict)
            and isinstance(entry.get("tool_call_id"), str)
            and str(entry.get("tool_call_id")).strip()
        ]
        if not normalized_entries:
            continue
        merged[tool_name] = _merge_tool_result_entries(
            merged.get(tool_name, []),
            normalized_entries,
        )
    return merged


def merge_tool_usage_state(
    left: object,
    right: object,
) -> dict[ToolName, dict[str, Any]]:
    normalized_left = left if isinstance(left, dict) else {}
    normalized_right = right if isinstance(right, dict) else {}
    merged: dict[ToolName, dict[str, Any]] = {
        str(tool_name): coerce_usage_mapping(
            {str(key): value for key, value in usage.items()}
        )
        for tool_name, usage in normalized_left.items()
        if isinstance(tool_name, str) and isinstance(usage, Mapping)
    }
    for tool_name, usage in normalized_right.items():
        if not isinstance(tool_name, str) or not isinstance(usage, Mapping):
            continue
        normalized_usage = coerce_usage_mapping(
            {str(key): value for key, value in usage.items()}
        )
        if not normalized_usage:
            continue
        merged[tool_name] = add_usages(
            merged.get(tool_name, {}),
            normalized_usage,
        )
    return merged


class BaseAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    chat_id: str
    provider: str
    model: str
    tool_results: NotRequired[Annotated[AgentToolResults, merge_tool_results_state]]
    tool_usage: NotRequired[Annotated[dict[ToolName, dict[str, Any]], merge_tool_usage_state]]
    runtime_budget: NotRequired[object]
    runtime_profiler: NotRequired[object]
    tool_kinds: NotRequired[dict[str, str]]


class AgentStreamContext(TypedDict, total=False):
    """Contexto extra opcional para streaming (actualmente sin campos activos)."""
    pass


class StreamEventBase(TypedDict, total=False):
    """Base común de eventos de stream sin metadatos workflow."""
    pass


class ResponseError(TypedDict):
    code: str
    message: str


class ResponseCreatedEvent(StreamEventBase):
    type: Literal["response.created"]
    response_id: str
    model: str


class ResponseOutputTextDeltaEvent(StreamEventBase):
    type: Literal["response.output_text.delta"]
    delta: str


class ResponseOutputTextDoneEvent(StreamEventBase):
    type: Literal["response.output_text.done"]
    text: str


class ResponseReasoningDeltaEvent(StreamEventBase):
    type: Literal["response.reasoning.delta"]
    delta: str


class ResponseReasoningDoneEvent(StreamEventBase):
    type: Literal["response.reasoning.done"]
    text: str


class ResponseToolCallCreatedEvent(StreamEventBase):
    type: Literal["response.tool_call.created"]
    tool_call_id: str
    name: str
    arguments: dict[str, Any]


class ResponseToolStreamDeltaEvent(StreamEventBase):
    type: Literal["response.tool_stream.delta"]
    tool_call_id: str
    name: str
    delta: str


class ResponseToolCallCompletedEvent(StreamEventBase, Generic[ResultT]):
    type: Literal["response.tool_call.completed"]
    tool_call_id: str
    name: str
    result: NotRequired[ResultT]


class ResponseToolCallFailedEvent(StreamEventBase):
    type: Literal["response.tool_call.failed"]
    tool_call_id: str
    name: str
    error: ResponseError


class ResponseIncompleteEvent(StreamEventBase):
    type: Literal["response.incomplete"]
    response_id: str
    reason: Literal["max_tokens", "timeout", "content_filter"]


class ResponseFailedEvent(StreamEventBase):
    type: Literal["response.failed"]
    response_id: str
    error: ResponseError


class ResponseCompletedEvent(StreamEventBase):
    type: Literal["response.completed"]
    response_id: str
    model: str
    full_response: str
    usage: dict[str, Any]
    tool_results: NotRequired[dict[str, list[ToolResultEntry[Any]]]]


AgentStreamEvent: TypeAlias = (
    ResponseCreatedEvent
    | ResponseOutputTextDeltaEvent
    | ResponseOutputTextDoneEvent
    | ResponseReasoningDeltaEvent
    | ResponseReasoningDoneEvent
    | ResponseToolCallCreatedEvent
    | ResponseToolStreamDeltaEvent
    | ResponseToolCallCompletedEvent[Any]
    | ResponseToolCallFailedEvent
    | ResponseIncompleteEvent
    | ResponseFailedEvent
    | ResponseCompletedEvent
)


__all__ = [
    "Agent",
    "DBAgent",
    "AgentReasoningConfig",
    "AgentRequest",
    "AgentStreamContext",
    "AgentStreamEvent",
    "AgentTextConfig",
    "AgentToolResult",
    "AgentToolResults",
    "BaseAgentState",
    "CreateAgentPayload",
    "ResponseCompletedEvent",
    "ResponseCreatedEvent",
    "ResponseError",
    "ResponseFailedEvent",
    "ResponseIncompleteEvent",
    "ResponseOutputTextDeltaEvent",
    "ResponseOutputTextDoneEvent",
    "ResponseReasoningDeltaEvent",
    "ResponseReasoningDoneEvent",
    "ResponseToolCallCompletedEvent",
    "ResponseToolCallCreatedEvent",
    "ResponseToolCallFailedEvent",
    "ResponseToolStreamDeltaEvent",
    "ToolResultEntry",
    "UpdateAgentPayload",
]
