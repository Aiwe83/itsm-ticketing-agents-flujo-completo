from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, cast

from bson import ObjectId
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from agents.base import BaseAgent, CompiledAgentGraph
from agents.factory import BaseAgentFactory
from core.agent_runtime import (
    AgentRuntimeProfiler,
    NoopRuntimeObserver,
    RuntimeBudget,
    RuntimeObserver,
)
from core.errors import ResourceNotFoundError, RuntimeLimitExceededError
from core.errors.base import ApplicationError
from core.logger import get_logger
from core.settings import AppSettings
from mcp_integration.client import MCPClient, MCPToolSessionScope
from models.agent import AgentStreamEvent, DBAgent
from models.chat import ConfiguredAgentChatRequest
from models.mcp import DBMCPServer
from models.openai_compatible.base import ImageDetail
from models.openai_compatible.chat_completions.input import (
    ChatCompletionsRequestPayload,
    ReasoningConfig,
)
from models.openai_compatible.chat_completions.messages import (
    ChatCompletionRequestAssistantMessage,
    ChatCompletionRequestDeveloperMessage,
    ChatCompletionRequestMessage,
    ChatCompletionRequestSystemMessage,
    ChatCompletionRequestUserMessage,
    MessageContentImagePart,
    MessageContentImageURL,
    MessageContentTextPart,
    UserContentPart,
)
from models.openai_compatible.responses.messages import (
    ResponseInputFileContent,
    ResponseInputImageContent,
    ResponseInputItem,
    ResponseInputTextContent,
)
from models.openai_compatible.responses.output import (
    FunctionToolCall,
    FunctionToolCallOutput,
    ResponseOutputItem,
    ResponseOutputMessage,
    ResponseOutputTextContent,
    ResponsesResponsePayload,
)
from providers.factory import (
    get_provider_for_model,
    get_provider_name_for_model,
    provider_name_matches,
)
from repositories.mongodb.agent import AgentRepository
from repositories.mongodb.mcp import MCPServerRepository
from services.base import BaseService

logger = get_logger()


@dataclass(slots=True)
class ParsedChatInput:
    invocation_messages: list[BaseMessage]
    validation_messages: list[ChatCompletionRequestMessage]


@dataclass(slots=True)
class PreparedChatRuntime:
    agent: BaseAgent[Any]
    runnable: CompiledAgentGraph
    messages: list[BaseMessage]
    chat_id: str
    configured_agent: dict[str, str]
    instructions: str | None
    mcp_tool_session_scope: MCPToolSessionScope | None = None
    budget: RuntimeBudget | None = None
    profiler: RuntimeObserver = field(default_factory=NoopRuntimeObserver)


@dataclass(slots=True)
class TerminalChatState:
    response_id: str | None = None
    response_text: str = ""
    reasoning_text: str = ""
    usage: dict[str, Any] = field(default_factory=dict)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    tool_stream: list[dict[str, Any]] = field(default_factory=list)
    tool_call_results: list[dict[str, Any]] = field(default_factory=list)
    tool_call_failures: list[dict[str, Any]] = field(default_factory=list)
    completed: bool = False
    incomplete_reason: str | None = None
    failed_error: dict[str, str] | None = None
    _tool_result_ids: set[str] = field(default_factory=set)
    _tool_failure_ids: set[str] = field(default_factory=set)
    _response_parts: list[str] = field(default_factory=list)
    _reasoning_parts: list[str] = field(default_factory=list)
    _tool_stream_index: dict[str, int] = field(default_factory=dict)


class ChatService(BaseService):
    def __init__(
        self,
        settings: AppSettings,
        agent_repository: AgentRepository,
        *,
        mcp_repository: MCPServerRepository,
        base_agent_factory: BaseAgentFactory,
    ) -> None:
        self._runtime_settings = settings.agent_runtime
        self._agent_repository = agent_repository
        self._mcp_repository = mcp_repository
        self._base_agent_factory = base_agent_factory

    @staticmethod
    def _resolve_chat_id(raw_chat_id: object) -> str:
        requested_chat_id = raw_chat_id.strip() if isinstance(raw_chat_id, str) else ""
        return requested_chat_id or f"chat_{uuid.uuid4().hex}"

    def _build_runtime_observer(
        self,
        *,
        chat_id: str,
        model_name: str,
        provider_name: str,
        configured_agent: dict[str, str],
    ) -> RuntimeObserver:
        if not self._runtime_settings.profiling_enabled:
            return NoopRuntimeObserver()
        profiler = AgentRuntimeProfiler(
            settings=self._runtime_settings,
            root_chat_id=chat_id,
            model=model_name,
            provider=provider_name,
        )
        profiler.set_root_agent(
            agent_id=configured_agent["id"],
            agent_name=configured_agent["name"],
        )
        return profiler

    @staticmethod
    def _runtime_extra_state(prepared: PreparedChatRuntime) -> dict[str, object]:
        extra_state: dict[str, object] = {}
        if prepared.budget is not None:
            extra_state["runtime_budget"] = prepared.budget
        if prepared.profiler.enabled:
            extra_state["runtime_profiler"] = prepared.profiler
        return extra_state

    @staticmethod
    def _terminal_response_text(terminal: TerminalChatState) -> str:
        if terminal.response_text:
            return terminal.response_text
        if terminal._response_parts:
            return "".join(terminal._response_parts)
        return ""

    @staticmethod
    def _terminal_reasoning_text(terminal: TerminalChatState) -> str:
        if terminal.reasoning_text:
            return terminal.reasoning_text
        if terminal._reasoning_parts:
            return "".join(terminal._reasoning_parts)
        return ""

    @classmethod
    def _effective_response_text(cls, terminal: TerminalChatState) -> str:
        return cls._terminal_response_text(terminal)

    @classmethod
    def _append_terminal_response_delta(cls, terminal: TerminalChatState, delta: str) -> None:
        if not delta:
            return
        terminal._response_parts.append(delta)
        terminal.response_text = ""

    @classmethod
    def _set_terminal_response_text(cls, terminal: TerminalChatState, text: str) -> None:
        terminal._response_parts = [text] if text else []
        terminal.response_text = text

    @classmethod
    def _append_terminal_reasoning_delta(cls, terminal: TerminalChatState, delta: str) -> None:
        if not delta:
            return
        terminal._reasoning_parts.append(delta)
        terminal.reasoning_text = ""

    @classmethod
    def _set_terminal_reasoning_text(cls, terminal: TerminalChatState, text: str) -> None:
        terminal._reasoning_parts = [text] if text else []
        terminal.reasoning_text = text

    @classmethod
    def _append_tool_stream_delta(
        cls,
        terminal: TerminalChatState,
        *,
        tool_call_id: str,
        name: str,
        delta: str,
    ) -> None:
        if not delta:
            return
        entry_index = terminal._tool_stream_index.get(tool_call_id)
        if entry_index is None:
            terminal._tool_stream_index[tool_call_id] = len(terminal.tool_stream)
            terminal.tool_stream.append(
                {
                    "tool_call_id": tool_call_id,
                    "name": name,
                    "text": delta,
                }
            )
            return
        terminal.tool_stream[entry_index]["text"] = (
            str(terminal.tool_stream[entry_index].get("text", "")) + delta
        )

    @staticmethod
    def _upsert_tool_call(
        terminal: TerminalChatState,
        *,
        tool_call_id: str,
        name: str,
        arguments: dict[str, Any] | None = None,
        status: str | None = None,
    ) -> None:
        for tool_call in terminal.tool_calls:
            if tool_call.get("tool_call_id") != tool_call_id:
                continue
            tool_call["name"] = name
            if arguments is not None:
                tool_call["arguments"] = arguments
            if status is not None:
                tool_call["status"] = status
            return

        entry: dict[str, Any] = {
            "tool_call_id": tool_call_id,
            "name": name,
        }
        if arguments is not None:
            entry["arguments"] = arguments
        if status is not None:
            entry["status"] = status
        terminal.tool_calls.append(entry)

    @classmethod
    def _capture_terminal_event(
        cls,
        terminal: TerminalChatState,
        event: AgentStreamEvent,
    ) -> None:
        event_type = event.get("type")
        if event_type == "response.created":
            response_id = event.get("response_id")
            if isinstance(response_id, str) and response_id:
                terminal.response_id = response_id
            return

        if event_type == "response.output_text.delta":
            delta = event.get("delta")
            if isinstance(delta, str):
                cls._append_terminal_response_delta(terminal, delta)
            return

        if event_type == "response.output_text.done":
            text = event.get("text")
            if isinstance(text, str):
                cls._set_terminal_response_text(terminal, text)
            return

        if event_type == "response.reasoning.delta":
            delta = event.get("delta")
            if isinstance(delta, str):
                cls._append_terminal_reasoning_delta(terminal, delta)
            return

        if event_type == "response.reasoning.done":
            text = event.get("text")
            if isinstance(text, str):
                cls._set_terminal_reasoning_text(terminal, text)
            return

        if event_type == "response.tool_call.created":
            tool_call_id = event.get("tool_call_id")
            name = event.get("name")
            if isinstance(tool_call_id, str) and isinstance(name, str):
                cls._upsert_tool_call(
                    terminal,
                    tool_call_id=tool_call_id,
                    name=name,
                    arguments=cls._tool_args_to_dict(event.get("arguments")),
                    status="in_progress",
                )
            return

        if event_type == "response.tool_stream.delta":
            tool_call_id = event.get("tool_call_id")
            name = event.get("name")
            delta = event.get("delta")
            if (
                isinstance(tool_call_id, str)
                and isinstance(name, str)
                and isinstance(delta, str)
            ):
                cls._append_tool_stream_delta(
                    terminal,
                    tool_call_id=tool_call_id,
                    name=name,
                    delta=delta,
                )
            return

        if event_type == "response.tool_call.completed":
            tool_call_id = event.get("tool_call_id")
            name = event.get("name")
            if isinstance(tool_call_id, str) and isinstance(name, str):
                cls._upsert_tool_call(
                    terminal,
                    tool_call_id=tool_call_id,
                    name=name,
                    status="completed",
                )
                if tool_call_id not in terminal._tool_result_ids:
                    terminal._tool_result_ids.add(tool_call_id)
                    terminal.tool_call_results.append(
                        {
                            "tool_call_id": tool_call_id,
                            "name": name,
                            "result": event.get("result"),
                        }
                    )
            return

        if event_type == "response.tool_call.failed":
            tool_call_id = event.get("tool_call_id")
            name = event.get("name")
            if isinstance(tool_call_id, str) and isinstance(name, str):
                cls._upsert_tool_call(
                    terminal,
                    tool_call_id=tool_call_id,
                    name=name,
                    status="failed",
                )
                if tool_call_id not in terminal._tool_failure_ids:
                    terminal._tool_failure_ids.add(tool_call_id)
                    terminal.tool_call_failures.append(
                        {
                            "tool_call_id": tool_call_id,
                            "name": name,
                            "error": dict(event.get("error", {}))
                            if isinstance(event.get("error"), Mapping)
                            else {},
                        }
                    )
            return

        if event_type == "response.incomplete":
            reason = event.get("reason")
            if isinstance(reason, str) and reason:
                terminal.incomplete_reason = reason
            return

        if event_type == "response.failed":
            error = event.get("error")
            terminal.failed_error = (
                {str(key): str(value) for key, value in error.items()}
                if isinstance(error, Mapping)
                else {}
            )
            return

        if event_type != "response.completed":
            return

        response_id = event.get("response_id")
        if isinstance(response_id, str) and response_id:
            terminal.response_id = response_id

        full_response = event.get("full_response")
        if isinstance(full_response, str):
            cls._set_terminal_response_text(terminal, full_response)

        usage = event.get("usage")
        if isinstance(usage, Mapping):
            terminal.usage = {str(key): value for key, value in usage.items()}

        terminal.completed = True

    @staticmethod
    def _build_exception_failed_event(
        *,
        terminal: TerminalChatState,
        chat_id: str,
        exc: Exception,
    ) -> AgentStreamEvent:
        if isinstance(exc, RuntimeLimitExceededError):
            code = "runtime_limit_exceeded"
        elif isinstance(exc, ApplicationError):
            code = exc.code or type(exc).__name__
        else:
            code = type(exc).__name__
        return {
            "type": "response.failed",
            "response_id": terminal.response_id or chat_id,
            "error": {
                "code": code,
                "message": str(exc) or "Chat execution failed.",
            },
        }

    async def _stream_prepared_events(
        self,
        *,
        prepared: PreparedChatRuntime,
        model_name: str,
        terminal: TerminalChatState,
    ) -> AsyncIterator[AgentStreamEvent]:
        profiler = prepared.profiler
        extra_state = self._runtime_extra_state(prepared)

        try:
            with profiler.measure_phase(
                "stream_execution",
                chat_id=prepared.chat_id,
                agent_id=prepared.configured_agent["id"],
                agent_name=prepared.configured_agent["name"],
            ):
                async with asyncio.timeout(
                    prepared.budget.remaining_seconds()
                    if prepared.budget is not None
                    else None
                ):
                    async for event in prepared.agent.astream_events(
                        prepared.runnable,
                        messages=prepared.messages,
                        model=model_name,
                        chat_id=prepared.chat_id,
                        extra_state=extra_state,
                    ):
                        self._capture_terminal_event(terminal, event)
                        yield event
        except TimeoutError:
            timeout_event: AgentStreamEvent = {
                "type": "response.incomplete",
                "response_id": terminal.response_id or prepared.chat_id,
                "reason": "timeout",
            }
            self._capture_terminal_event(terminal, timeout_event)
            yield timeout_event
        except Exception as exc:
            logger.opt(exception=exc).error(
                "chat_stream_failed | chat_id={chat_id}",
                chat_id=prepared.chat_id,
            )
            failed_event = self._build_exception_failed_event(
                terminal=terminal,
                chat_id=prepared.chat_id,
                exc=exc,
            )
            self._capture_terminal_event(terminal, failed_event)
            yield failed_event

    async def _finalize_chat_runtime(
        self,
        *,
        prepared: PreparedChatRuntime,
        terminal: TerminalChatState,
    ) -> None:
        try:
            pass
        finally:
            try:
                await self._close_mcp_tool_session_scope(
                    prepared.mcp_tool_session_scope,
                    chat_id=prepared.chat_id,
                )
            finally:
                prepared.profiler.finish(
                    chat_id=prepared.chat_id,
                    outcome=self._runtime_outcome(terminal),
                    response_chars=len(self._effective_response_text(terminal)),
                    tool_calls=len(terminal.tool_calls),
                )

    async def _close_mcp_tool_session_scope(
        self,
        scope: MCPToolSessionScope | None,
        *,
        chat_id: str,
    ) -> None:
        if scope is None:
            return
        try:
            await scope.aclose()
        except Exception as exc:
            logger.opt(exception=exc).warning(
                "mcp_tool_session_scope_close_error | chat_id={chat_id}",
                chat_id=chat_id,
            )

    @staticmethod
    def _runtime_outcome(terminal: TerminalChatState) -> str:
        if terminal.completed:
            return "ok"
        if terminal.failed_error is not None:
            return "error"
        if terminal.incomplete_reason is not None:
            return terminal.incomplete_reason
        return "unknown"

    async def _prepare_chat_runtime(
        self,
        *,
        agent_document: DBAgent,
        payload: ConfiguredAgentChatRequest,
        chat_id: str,
        profiler: RuntimeObserver,
    ) -> PreparedChatRuntime:
        provider = get_provider_for_model(payload.model)
        detected_provider_name = get_provider_name_for_model(payload.model)
        if payload.provider is not None and not provider_name_matches(
            provider_name=payload.provider,
            expected_provider_name=detected_provider_name,
        ):
            raise ApplicationError(
                message=(
                    f"Provider '{payload.provider.value}' does not match model "
                    f"'{payload.model}' ({detected_provider_name})."
                ),
                status_code=400,
            )

        configured_agent = self._agent_reference(agent_document)
        instructions = self._compose_instructions(
            agent_document.get("instructions"),
            payload.instructions,
        )
        parsed_input = self._parse_input(payload.input)
        request_payload = self._to_chat_completions_payload(
            payload,
            messages=parsed_input.validation_messages,
            chat_id=chat_id,
        )
        budget = RuntimeBudget.from_settings(
            settings=self._runtime_settings,
            root_chat_id=chat_id,
        )
        profiler.set_context(
            context_messages=len(parsed_input.invocation_messages),
            history_bytes=0,
        )

        mcp_servers = await self._resolve_agent_mcps(agent_document)
        mcp_tool_session_scope: MCPToolSessionScope | None = None
        with profiler.measure_phase("compile_graph", chat_id=chat_id):
            agent = self._base_agent_factory.build(
                provider=provider,
                tools=list(self._base_agent_factory.get_internal_tools()),
            )
            agent_mcp_client = cast(MCPClient | None, getattr(agent, "mcp_client", None))
            try:
                if mcp_servers and agent_mcp_client is not None:
                    mcp_tool_session_scope = await agent_mcp_client.open_tool_session_scope(
                        list(mcp_servers),
                        runtime_auth_by_server_id=None,
                    )
                runnable = await agent.acreate_runnable(
                    payload=request_payload,
                    system_prompt=instructions,
                    mcp_servers=list(mcp_servers),
                    mcp_tool_session_scope=mcp_tool_session_scope,
                    runtime_mcp_auth=None,
                    profiler=profiler,
                )
            except Exception:
                await self._close_mcp_tool_session_scope(
                    mcp_tool_session_scope,
                    chat_id=chat_id,
                )
                raise

        return PreparedChatRuntime(
            agent=agent,
            runnable=runnable,
            messages=list(parsed_input.invocation_messages),
            chat_id=chat_id,
            configured_agent=configured_agent,
            instructions=instructions,
            mcp_tool_session_scope=mcp_tool_session_scope,
            budget=budget,
            profiler=profiler,
        )

    async def chat_with_agent(
        self,
        agent_id: str,
        payload: ConfiguredAgentChatRequest,
    ) -> AsyncIterator[AgentStreamEvent]:
        chat_id = self._resolve_chat_id(payload.chat_id)
        agent_document = await self._get_accessible_agent_document(agent_id)
        configured_agent = self._agent_reference(agent_document)
        profiler = self._build_runtime_observer(
            chat_id=chat_id,
            model_name=payload.model,
            provider_name=get_provider_name_for_model(payload.model),
            configured_agent=configured_agent,
        )
        prepared = await self._prepare_chat_runtime(
            agent_document=agent_document,
            payload=payload,
            chat_id=chat_id,
            profiler=profiler,
        )
        terminal = TerminalChatState()

        try:
            async for event in self._stream_prepared_events(
                prepared=prepared,
                model_name=payload.model,
                terminal=terminal,
            ):
                yield event
        finally:
            await self._finalize_chat_runtime(
                prepared=prepared,
                terminal=terminal,
            )

    async def chat_with_agent_response(
        self,
        agent_id: str,
        payload: ConfiguredAgentChatRequest,
    ) -> ResponsesResponsePayload:
        chat_id = self._resolve_chat_id(payload.chat_id)
        agent_document = await self._get_accessible_agent_document(agent_id)
        configured_agent = self._agent_reference(agent_document)
        profiler = self._build_runtime_observer(
            chat_id=chat_id,
            model_name=payload.model,
            provider_name=get_provider_name_for_model(payload.model),
            configured_agent=configured_agent,
        )
        prepared = await self._prepare_chat_runtime(
            agent_document=agent_document,
            payload=payload,
            chat_id=chat_id,
            profiler=profiler,
        )
        terminal = TerminalChatState()

        try:
            async for _event in self._stream_prepared_events(
                prepared=prepared,
                model_name=payload.model,
                terminal=terminal,
            ):
                pass
            return self._build_response_payload(
                payload=payload,
                chat_id=prepared.chat_id,
                instructions=prepared.instructions,
                terminal=terminal,
            )
        finally:
            await self._finalize_chat_runtime(
                prepared=prepared,
                terminal=terminal,
            )

    async def _get_accessible_agent_document(self, agent_id: str) -> DBAgent:
        normalized_agent_id = self._normalize_object_id(
            agent_id,
            field_name="agent_id",
        )
        document = await self._agent_repository.find_by_id(normalized_agent_id)
        if document is None or not bool(document.get("enabled", True)):
            raise ResourceNotFoundError(f"Agent '{agent_id}' was not found.")
        return document

    async def _resolve_agent_mcps(self, agent_document: DBAgent) -> list[DBMCPServer]:
        mcp_ids = self._coerce_reference_ids(agent_document.get("mcp_ids"))
        if not mcp_ids:
            return []

        documents = await self._mcp_repository.find_enabled_by_ids(tuple(mcp_ids))
        documents_by_id = {str(document.get("_id")): document for document in documents}
        mcp_servers: list[DBMCPServer] = []
        for mcp_id in mcp_ids:
            document = documents_by_id.get(mcp_id)
            if document is None:
                raise ApplicationError(
                    message=f"Agent '{agent_document.get('name', '')}' references an unavailable MCP.",
                    status_code=400,
                    error_name="invalid_agent_configuration",
                )
            mcp_servers.append(document)
        return mcp_servers

    @staticmethod
    def _agent_reference(agent_document: DBAgent) -> dict[str, str]:
        return {
            "id": str(agent_document.get("_id", "")),
            "name": str(agent_document.get("name", "")),
        }

    @staticmethod
    def _compose_instructions(
        agent_instructions: str | None,
        request_instructions: str | None,
    ) -> str | None:
        parts = [
            value.strip()
            for value in (agent_instructions, request_instructions)
            if isinstance(value, str) and value.strip()
        ]
        if not parts:
            return None
        return "\n\n".join(parts)

    @staticmethod
    def _chat_completions_reasoning_config(
        payload: ConfiguredAgentChatRequest,
    ) -> ReasoningConfig | None:
        if payload.reasoning_effort is None and payload.reasoning_summary is None:
            return None
        return ReasoningConfig(
            effort=payload.reasoning_effort,
            summary=payload.reasoning_summary,
        )

    @staticmethod
    def _to_chat_completions_payload(
        payload: ConfiguredAgentChatRequest,
        *,
        messages: list[ChatCompletionRequestMessage],
        chat_id: str,
    ) -> ChatCompletionsRequestPayload:
        return ChatCompletionsRequestPayload(
            provider=payload.provider,
            messages=messages,
            model=payload.model,
            max_completion_tokens=payload.max_output_tokens,
            metadata=payload.metadata,
            reasoning=ChatService._chat_completions_reasoning_config(payload),
            reasoning_effort=payload.reasoning_effort,
            temperature=payload.temperature,
            top_p=payload.top_p,
            verbosity=payload.verbosity,
            chat_id=chat_id,
        )

    def _build_response_payload(
        self,
        *,
        payload: ConfiguredAgentChatRequest,
        chat_id: str,
        instructions: str | None,
        terminal: TerminalChatState,
    ) -> ResponsesResponsePayload:
        if terminal.failed_error is not None:
            error_code = terminal.failed_error.get("code", "chat_execution_failed")
            error_message = terminal.failed_error.get("message", "Chat execution failed.")
            if error_code in {"runtime_limit_exceeded", "RuntimeLimitExceededError"}:
                raise RuntimeLimitExceededError(message=error_message)
            raise ApplicationError(
                message=error_message,
                status_code=500,
                error_name=error_code,
            )

        status = "completed" if terminal.completed else "incomplete"
        response_text = self._effective_response_text(terminal)
        metadata = self._build_response_metadata(
            payload_metadata=payload.metadata,
            chat_id=chat_id,
            terminal=terminal,
        )

        response_object = cast(
            ResponsesResponsePayload,
            {
                "id": terminal.response_id or chat_id,
                "object": "response",
                "status": status,
                "created_at": self._created_at_epoch(),
                "model": payload.model,
                "output": self._build_response_output_items(
                    response_text=response_text,
                    response_status=status,
                    tool_calls=terminal.tool_calls,
                    tool_call_results=terminal.tool_call_results,
                    tool_call_failures=terminal.tool_call_failures,
                ),
                "parallel_tool_calls": True,
                "metadata": metadata,
                "temperature": payload.temperature,
                "top_p": payload.top_p,
                "instructions": instructions,
                "usage": terminal.usage or None,
            },
        )
        if status == "incomplete":
            response_object["incomplete_details"] = {
                "reason": terminal.incomplete_reason or "unknown",
            }
        return response_object

    @classmethod
    def _build_response_output_items(
        cls,
        *,
        response_text: str,
        response_status: str,
        tool_calls: Sequence[Mapping[str, Any]],
        tool_call_results: Sequence[Mapping[str, Any]],
        tool_call_failures: Sequence[Mapping[str, Any]],
    ) -> list[ResponseOutputItem]:
        items: list[ResponseOutputItem] = []

        if response_text:
            items.append(
                cast(
                    ResponseOutputMessage,
                    {
                        "type": "message",
                        "role": "assistant",
                        "status": response_status,
                        "content": [
                            cast(
                                ResponseOutputTextContent,
                                {
                                    "type": "output_text",
                                    "text": response_text,
                                    "annotations": [],
                                    "logprobs": None,
                                },
                            )
                        ],
                    },
                )
            )

        for tool_call in tool_calls:
            tool_call_id = tool_call.get("tool_call_id")
            name = tool_call.get("name")
            if not isinstance(tool_call_id, str) or not isinstance(name, str):
                continue
            items.append(
                cast(
                    FunctionToolCall,
                    {
                        "type": "function_call",
                        "call_id": tool_call_id,
                        "name": name,
                        "arguments": json.dumps(
                            cls._tool_args_to_dict(tool_call.get("arguments")),
                            ensure_ascii=False,
                        ),
                        "status": tool_call.get("status"),
                    },
                )
            )

        for tool_result in tool_call_results:
            tool_call_id = tool_result.get("tool_call_id")
            if not isinstance(tool_call_id, str):
                continue
            items.append(
                cast(
                    FunctionToolCallOutput,
                    {
                        "type": "function_call_output",
                        "call_id": tool_call_id,
                        "output": tool_result.get("result"),
                        "status": "completed",
                    },
                )
            )

        for failure in tool_call_failures:
            tool_call_id = failure.get("tool_call_id")
            if not isinstance(tool_call_id, str):
                continue
            items.append(
                cast(
                    FunctionToolCallOutput,
                    {
                        "type": "function_call_output",
                        "call_id": tool_call_id,
                        "output": {"error": failure.get("error")},
                        "status": "incomplete",
                    },
                )
            )

        return items

    @classmethod
    def _build_response_metadata(
        cls,
        *,
        payload_metadata: dict[str, Any] | None,
        chat_id: str,
        terminal: TerminalChatState,
    ) -> dict[str, Any] | None:
        metadata = dict(payload_metadata or {})
        metadata["chat_id"] = chat_id

        reasoning_text = cls._terminal_reasoning_text(terminal)
        if reasoning_text:
            metadata["reasoning"] = reasoning_text
        if terminal.tool_stream:
            metadata["tool_stream"] = list(terminal.tool_stream)
        if terminal.tool_call_failures:
            metadata["tool_call_failures"] = list(terminal.tool_call_failures)
        return metadata or None

    def _parse_input(self, input_payload: object) -> ParsedChatInput:
        if isinstance(input_payload, str):
            return ParsedChatInput(
                invocation_messages=[HumanMessage(content=input_payload)],
                validation_messages=[ChatCompletionRequestUserMessage(content=input_payload)],
            )
        if not isinstance(input_payload, list):
            raise ApplicationError(
                message="Unsupported input payload for chat endpoint.",
                status_code=400,
            )

        invocation_messages: list[BaseMessage] = []
        validation_messages: list[ChatCompletionRequestMessage] = []
        user_count = 0

        for item in input_payload:
            normalized_item = self._normalize_input_item(item)
            invocation_messages.append(self._to_base_message(normalized_item))
            validation_messages.append(self._to_chat_completion_message(normalized_item))
            if normalized_item["role"] == "user":
                user_count += 1

        if user_count == 0:
            raise ApplicationError(
                message="Chat requests must include at least one user message.",
                status_code=400,
            )

        return ParsedChatInput(
            invocation_messages=invocation_messages,
            validation_messages=validation_messages,
        )

    def _normalize_input_item(self, item: object) -> dict[str, Any]:
        if not isinstance(item, ResponseInputItem):
            raise ApplicationError(
                message="Unsupported input item in chat payload.",
                status_code=400,
            )

        text_content, content_blocks = self._coerce_request_content(item.content)
        return {
            "role": item.role,
            "content": text_content,
            "content_blocks": content_blocks,
        }

    @classmethod
    def _to_base_message(cls, item: Mapping[str, Any]) -> BaseMessage:
        role = item["role"]
        content = cast(str, item["content"])
        content_blocks = item.get("content_blocks")
        if role in {"system", "developer"}:
            return SystemMessage(content=content)
        if role == "assistant":
            return AIMessage(content=content)
        return HumanMessage(
            content=cls._user_langchain_content(
                content_blocks=content_blocks,
                fallback_text=content,
            )
        )

    @classmethod
    def _to_chat_completion_message(
        cls,
        item: Mapping[str, Any],
    ) -> ChatCompletionRequestMessage:
        role = item["role"]
        content = cast(str, item["content"])
        content_blocks = item.get("content_blocks")
        if role == "developer":
            return ChatCompletionRequestDeveloperMessage(content=content)
        if role == "system":
            return ChatCompletionRequestSystemMessage(content=content)
        if role == "assistant":
            return ChatCompletionRequestAssistantMessage(content=content)
        return ChatCompletionRequestUserMessage(
            content=cls._user_chat_completion_content(
                content_blocks=content_blocks,
                fallback_text=content,
            )
        )

    @staticmethod
    def _normalized_user_multimodal_parts(
        *,
        content_blocks: object,
        fallback_text: str,
    ) -> list[dict[str, Any]]:
        if not isinstance(content_blocks, list):
            return []

        parts: list[dict[str, Any]] = []
        has_image_part = False
        has_file_part = False
        for raw_block in content_blocks:
            if not isinstance(raw_block, Mapping):
                continue
            block_type = raw_block.get("type")
            if block_type in {"input_text", "text"}:
                text = raw_block.get("text")
                if isinstance(text, str) and text:
                    parts.append({"type": "text", "text": text})
                continue
            if block_type == "input_image":
                image_url = raw_block.get("image_url")
                if not isinstance(image_url, str) or not image_url.strip():
                    logger.warning(
                        "chat_input_image_omitted | reason=missing_image_url file_id={file_id}",
                        file_id=raw_block.get("file_id", "-"),
                    )
                    continue
                image_payload: dict[str, Any] = {"url": image_url}
                detail = raw_block.get("detail")
                if isinstance(detail, str) and detail:
                    image_payload["detail"] = detail
                parts.append({"type": "image_url", "image_url": image_payload})
                has_image_part = True
                continue
            if block_type != "input_file":
                continue

            file_id = raw_block.get("file_id")
            if not isinstance(file_id, str) or not file_id.strip():
                logger.warning("chat_input_file_omitted | reason=missing_file_id")
                continue
            normalized_file_id = file_id.strip()
            parts.append(
                {
                    "type": "file_ref",
                    "file_id": normalized_file_id,
                    "text": f"[input_file_id:{normalized_file_id}]",
                }
            )
            has_file_part = True

        if has_image_part or has_file_part:
            return parts
        return [{"type": "text", "text": fallback_text}] if fallback_text else []

    @classmethod
    def _user_langchain_content(
        cls,
        *,
        content_blocks: object,
        fallback_text: str,
    ) -> str | list[str | dict[str, Any]]:
        parts = cls._normalized_user_multimodal_parts(
            content_blocks=content_blocks,
            fallback_text=fallback_text,
        )
        has_image_part = any(part.get("type") == "image_url" for part in parts)
        has_file_part = any(part.get("type") == "file_ref" for part in parts)
        if not has_image_part and not has_file_part:
            return fallback_text

        normalized_parts: list[str | dict[str, Any]] = []
        for part in parts:
            if part.get("type") == "file_ref":
                normalized_parts.append(
                    {
                        "type": "text",
                        "text": str(part.get("text", "")),
                    }
                )
                continue
            normalized_parts.append(dict(part))
        return normalized_parts

    @classmethod
    def _user_chat_completion_content(
        cls,
        *,
        content_blocks: object,
        fallback_text: str,
    ) -> str | list[UserContentPart]:
        parts = cls._normalized_user_multimodal_parts(
            content_blocks=content_blocks,
            fallback_text=fallback_text,
        )
        has_image_part = any(part.get("type") == "image_url" for part in parts)
        has_file_part = any(part.get("type") == "file_ref" for part in parts)
        if not has_image_part and not has_file_part:
            return fallback_text

        serialized_parts: list[MessageContentTextPart | MessageContentImagePart] = []
        for part in parts:
            part_type = part.get("type")
            if part_type == "text":
                text = part.get("text")
                if isinstance(text, str) and text:
                    serialized_parts.append(MessageContentTextPart(text=text))
                continue
            if part_type == "file_ref":
                text = str(part.get("text") or "").strip()
                if text:
                    serialized_parts.append(MessageContentTextPart(text=text))
                continue
            if part_type != "image_url":
                continue
            image_payload = part.get("image_url")
            if not isinstance(image_payload, Mapping):
                continue
            image_url = image_payload.get("url")
            if not isinstance(image_url, str) or not image_url:
                continue
            detail = image_payload.get("detail")
            detail_value = cast(ImageDetail, detail) if detail in {"auto", "low", "high"} else None
            serialized_parts.append(
                MessageContentImagePart(
                    image_url=MessageContentImageURL(
                        url=image_url,
                        detail=detail_value,
                    )
                )
            )
        return cast(str | list[UserContentPart], serialized_parts or fallback_text)

    @staticmethod
    def _coerce_request_content(
        content: object,
    ) -> tuple[str, list[dict[str, Any]] | None]:
        if isinstance(content, str):
            return content, [{"type": "input_text", "text": content}]
        if not isinstance(content, list):
            raise ApplicationError(
                message="Unsupported message content in chat payload.",
                status_code=400,
            )

        text_parts: list[str] = []
        content_blocks: list[dict[str, Any]] = []
        for item in content:
            if isinstance(item, ResponseInputTextContent):
                text_parts.append(item.text)
                content_blocks.append({"type": "input_text", "text": item.text})
                continue
            if isinstance(item, ResponseInputImageContent):
                content_blocks.append(
                    {
                        "type": "input_image",
                        "image_url": item.image_url,
                        "file_id": item.file_id,
                        "detail": item.detail,
                    }
                )
                continue
            if isinstance(item, ResponseInputFileContent):
                normalized_file_id = item.file_id.strip()
                if not normalized_file_id:
                    raise ApplicationError(
                        message="input_file.file_id cannot be empty.",
                        status_code=400,
                        error_name="invalid_input_file_reference",
                    )
                if not ObjectId.is_valid(normalized_file_id):
                    raise ApplicationError(
                        message="input_file.file_id is invalid.",
                        status_code=400,
                        error_name="invalid_input_file_reference",
                    )
                content_blocks.append(
                    {
                        "type": "input_file",
                        "file_id": normalized_file_id,
                    }
                )
                continue
            raise ApplicationError(
                message="Unsupported message content in chat payload.",
                status_code=400,
            )

        text_content = "\n".join(text_parts)
        if not any(
            isinstance(block, Mapping) and block.get("type") == "input_text"
            for block in content_blocks
        ):
            content_blocks.insert(0, {"type": "input_text", "text": text_content})
        return text_content, content_blocks or None

    @staticmethod
    def _tool_args_to_dict(raw_args: object) -> dict[str, Any]:
        if isinstance(raw_args, Mapping):
            return {str(key): value for key, value in raw_args.items()}
        if isinstance(raw_args, str):
            stripped = raw_args.strip()
            if not stripped:
                return {}
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                return {"_raw": stripped}
            if isinstance(parsed, Mapping):
                return {str(key): value for key, value in parsed.items()}
            return {"_raw": stripped}
        if raw_args is None:
            return {}
        return {"_raw": str(raw_args)}

    @staticmethod
    def _created_at_epoch() -> int:
        return int(time.time())

    @staticmethod
    def _coerce_reference_ids(raw_values: object) -> list[str]:
        if not isinstance(raw_values, list):
            return []
        return [str(value) for value in raw_values if str(value).strip()]
