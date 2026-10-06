from __future__ import annotations

import json
import time
from collections.abc import AsyncGenerator, Mapping, Sequence
from dataclasses import dataclass
from typing import (
    Any,
    Generic,
    Literal,
    TypeAlias,
    TypeVar,
    cast,
)

from langchain.tools import ToolRuntime
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    SystemMessage,
)
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import Command
from msgspec import Struct, field

from core.agent_runtime import RuntimeBudget, RuntimeObserver
from core.errors.agent import (
    AgentInvalidPayloadError,
    AgentReservedStateKeyError,
    AgentRuntimeStateError,
    AgentStreamContractError,
    AgentStreamEventValidationError,
    AgentToolArgsJSONError,
    AgentToolArgsTypeError,
    AgentToolCallContractError,
    AgentToolExecutionError,
    AgentUnhandledStreamError,
)
from core.errors.base import ApplicationError
from core.errors.mcp import MCPConfigError, MCPConnectionError
from core.logger import get_logger
from core.settings import AgentRuntimeSettings
from mcp_integration.client import MCPClient, MCPToolSessionScope
from models.agent import (
    AgentStreamContext,
    AgentStreamEvent,
    BaseAgentState,
    ResponseCompletedEvent,
    ResponseCreatedEvent,
    ResponseFailedEvent,
    ResponseIncompleteEvent,
    ResponseOutputTextDeltaEvent,
    ResponseOutputTextDoneEvent,
    ResponseReasoningDeltaEvent,
    ResponseReasoningDoneEvent,
    ResponseToolCallCompletedEvent,
    ResponseToolCallCreatedEvent,
    ToolResultEntry,
)
from models.mcp import DBMCPServer
from models.openai_compatible.chat_completions.input import (
    ChatCompletionsRequestPayload,
)
from providers.base import Provider
from tools import build_tool_error_command
from utils.usage import add_usages, coerce_usage_mapping

StateT = TypeVar("StateT", bound=BaseAgentState)
ToolKind = Literal["tool_internal", "tool_mcp"]
CompiledAgentGraph: TypeAlias = Any
MessageStreamChunk = tuple[AIMessage | AIMessageChunk, dict[str, object] | None]
IncompleteReason = Literal["max_tokens", "timeout", "content_filter"]
logger = get_logger()


class PartialToolCallState(Struct):
    """Estado parcial acumulado de una tool call durante el streaming."""

    name: str | None = None
    arg_fragments: list[str] = field(default_factory=list)
    arguments: dict[str, Any] = field(default_factory=dict)
    emitted: bool = False

    @property
    def args_text(self) -> str:
        """Concatena los fragmentos parciales de argumentos recibidos en streaming."""
        return "".join(self.arg_fragments)


class ToolStateAccumulator(Struct):
    """Acumulador del estado de tools a lo largo de una respuesta en streaming."""

    results_by_tool_name: dict[str, list[ToolResultEntry[Any]]] = field(
        default_factory=dict
    )
    usage_by_tool_name: dict[str, dict[str, Any]] = field(
        default_factory=dict
    )


class ToolExecutionContext(Struct):
    """Contexto derivado de una ejecución concreta de tool dentro del grafo."""

    tool_name: str | None
    tool_call_id: str | None
    chat_id: str | None
    profiler: RuntimeObserver | None
    budget: RuntimeBudget | None
    call_kind: str
    tool: Any
    runtime: Any
    tool_args: dict[str, Any] | None




def _extract_tool_call_payload(
    raw_call: object,
) -> tuple[str | None, str | None, dict[str, Any] | str | None, int | None]:
    """Extrae nombre, id, argumentos e índice de una tool call en formatos heterogéneos."""
    call_name: str | None = None
    call_id: str | None = None
    call_args: dict[str, Any] | str | None = None
    call_index: int | None = None

    if isinstance(raw_call, Mapping):
        name_value = raw_call.get("name")
        id_value = raw_call.get("id")
        args_value = raw_call.get("args")
        index_value = raw_call.get("index")
        function_value = raw_call.get("function")

        if not isinstance(name_value, str) and isinstance(function_value, Mapping):
            nested_name = function_value.get("name")
            if isinstance(nested_name, str):
                name_value = nested_name

        if args_value is None and isinstance(function_value, Mapping):
            args_value = function_value.get("arguments")

        if isinstance(name_value, str) and name_value.strip():
            call_name = name_value.strip()
        if isinstance(id_value, str) and id_value.strip():
            call_id = id_value.strip()
        if isinstance(args_value, dict):
            call_args = {str(key): value for key, value in args_value.items()}
        elif isinstance(args_value, str):
            call_args = args_value
        if isinstance(index_value, int):
            call_index = index_value
        return call_name, call_id, call_args, call_index

    name_value = getattr(raw_call, "name", None)
    id_value = getattr(raw_call, "id", None)
    args_value = getattr(raw_call, "args", None)
    index_value = getattr(raw_call, "index", None)
    function_value = getattr(raw_call, "function", None)

    if not isinstance(name_value, str) and isinstance(function_value, Mapping):
        nested_name = function_value.get("name")
        if isinstance(nested_name, str):
            name_value = nested_name

    if args_value is None and isinstance(function_value, Mapping):
        args_value = function_value.get("arguments")

    if isinstance(name_value, str) and name_value.strip():
        call_name = name_value.strip()
    if isinstance(id_value, str) and id_value.strip():
        call_id = id_value.strip()
    call_args = args_value
    if isinstance(index_value, int):
        call_index = index_value
    return call_name, call_id, call_args, call_index


class BaseAgent(Generic[StateT]):
    """Agente base que compone modelo, herramientas y streaming de eventos."""

    _STREAM_EVENT_TYPES = frozenset(
        {
            "response.created",
            "response.output_text.delta",
            "response.output_text.done",
            "response.reasoning.delta",
            "response.reasoning.done",
            "response.tool_call.created",
            "response.tool_stream.delta",
            "response.tool_call.completed",
            "response.tool_call.failed",
            "response.incomplete",
            "response.failed",
            "response.completed",
        }
    )
    _STREAM_METADATA_KEYS: tuple[str, ...] = ()
    
    _RESERVED_STATE_KEYS = frozenset(
        {
            "messages",
            "chat_id",
            "provider",
            "model",
        }
    )
    def __init__(
        self,
        provider: Provider,
        tools: list[BaseTool] | None = None,
        state_schema: type[StateT] | None = None,
        mcp_client: MCPClient | None = None,
        runtime_settings: AgentRuntimeSettings | None = None,
    ) -> None:
        """Inicializa el agente con su provider, herramientas y dependencias opcionales."""
        self.provider = provider
        self.tools = list(tools or [])
        self.mcp_client = mcp_client
        self.state_schema: type[StateT] = (
            state_schema if state_schema is not None else cast(type[StateT], BaseAgentState)
        )
        self._runtime_settings = runtime_settings or AgentRuntimeSettings()

    async def acreate_runnable(
        self,
        payload: ChatCompletionsRequestPayload,
        system_prompt: str | None,
        tools: list[BaseTool] | None = None,
        *,
        mcp_servers: list[DBMCPServer] | None = None,
        mcp_tool_session_scope: MCPToolSessionScope | None = None,
        runtime_mcp_auth: Mapping[str, object] | None = None,
        tool_choice: dict[str, Any] | str | bool | None = None,
        profiler: RuntimeObserver,
    ) -> CompiledAgentGraph:
        """Construye de forma asíncrona el grafo compilado, incluyendo tools MCP si aplica."""
        del runtime_mcp_auth
        validation = await self.provider.avalidate(payload)
        if validation.get("is_valid") is not True:
            raise AgentInvalidPayloadError(
                message=validation.get("error_message") or "Invalid payload",
            )

        llm = self.provider.get_chat_model(
            payload.model,
            temperature=payload.temperature,
            top_p=payload.top_p,
            max_tokens=payload.max_completion_tokens,
        )
        runnable_tools = tools if tools is not None else self.tools
        mcp_tools: list[BaseTool] = []

        if mcp_servers:
            mcp_tools = await self._load_mcp_tools(
                mcp_servers=mcp_servers,
                mcp_tool_session_scope=mcp_tool_session_scope,
                profiler=profiler,
            )
            if mcp_tools:
                runnable_tools.extend(mcp_tools)

        tool_kinds = self._build_tool_kind_mapping(runnable_tools, mcp_tools=mcp_tools)
        compiled_graph = self._compile_agent_graph(
            llm,
            runnable_tools,
            system_prompt,
            tool_kinds,
            tool_choice=tool_choice,
        )
        setattr(compiled_graph, "_agentic_tool_kinds", dict(tool_kinds))
        return compiled_graph

    async def ainvoke(
        self,
        agent: CompiledAgentGraph,
        messages: list[BaseMessage],
        model: str,
        chat_id: str,
        extra_state: dict[str, object] | None = None,
    ) -> StateT:
        """Ejecuta el grafo completo y devuelve el estado final del agente."""
        state = cast(
            StateT,
            self._build_initial_state(
                messages=messages,
                provider_name=self.provider.provider_name,
                model=model,
                chat_id=chat_id,
                extra_state=self._merge_graph_extra_state(agent=agent, extra_state=extra_state),
            ),
        )
        return cast(StateT, await agent.ainvoke(state))

    async def astream_events(
        self,
        agent: CompiledAgentGraph,
        messages: list[BaseMessage],
        model: str,
        chat_id: str,
        context: AgentStreamContext | None = None,
        extra_state: dict[str, object] | None = None,
    ) -> AsyncGenerator[AgentStreamEvent, None]:
        """Ejecuta el grafo en streaming y emite eventos normalizados de respuesta."""
        del context
        response_id = chat_id
        full_response_parts: list[str] = []
        reasoning_parts: list[str] = []
        usage: dict[str, Any] = {}
        tool_state = ToolStateAccumulator()
        incomplete_reason: IncompleteReason | None = None
        partial_tool_calls: dict[str, PartialToolCallState] = {}

        initial_state = cast(
            StateT,
            self._build_initial_state(
                messages=messages,
                provider_name=self.provider.provider_name,
                model=model,
                chat_id=chat_id,
                extra_state=self._merge_graph_extra_state(agent=agent, extra_state=extra_state),
            ),
        )

        yield self._build_created_event(
            response_id=response_id,
            model=model,
        )

        try:
            async for mode, chunk in agent.astream(
                initial_state,
                stream_mode=["messages", "custom", "updates"],
            ):
                if mode == "messages":
                    stream_chunk = self._coerce_message_stream_chunk(chunk)
                    if stream_chunk is None:
                        continue
                    message = stream_chunk[0]

                    usage_meta = getattr(message, "usage_metadata", None)
                    normalized_usage = Provider._normalize_usage_metadata(usage_meta)
                    if normalized_usage:
                        usage = add_usages(usage, normalized_usage)

                    incomplete_reason = incomplete_reason or self._extract_incomplete_reason(
                        message
                    )

                    for tool_call_event in self._extract_stream_tool_call_events(
                        stream_chunk,
                        partial_tool_calls=partial_tool_calls,
                    ):
                        self._update_tool_state_from_event(tool_state, tool_call_event)
                        yield tool_call_event

                    delta, reasoning_delta = self._extract_stream_text_delta(stream_chunk)
                    if reasoning_delta:
                        reasoning_parts.append(reasoning_delta)
                        yield self._build_delta_event(
                            event_type="response.reasoning.delta",
                            delta=reasoning_delta,
                        )

                    if delta:
                        full_response_parts.append(delta)
                        yield self._build_delta_event(
                            event_type="response.output_text.delta",
                            delta=delta,
                        )

                elif mode == "custom":
                    custom_text = ""
                    if isinstance(chunk, dict):
                        event_type = chunk.get("type")
                        if isinstance(event_type, str) and event_type.startswith("response."):
                            sanitized_event = self._sanitize_stream_event_payload(chunk)
                            yield sanitized_event

                            self._update_tool_state_from_event(tool_state, sanitized_event)
                            if event_type == "response.output_text.delta":
                                delta = sanitized_event.get("delta")
                                if isinstance(delta, str) and delta:
                                    custom_text = delta
                        else:
                            custom_text = self._extract_text_from_content(chunk)
                    elif isinstance(chunk, str):
                        custom_text = chunk

                    if custom_text:
                        full_response_parts.append(custom_text)

                elif mode == "updates":
                    if not isinstance(chunk, dict):
                        raise AgentStreamContractError(
                            message="Invalid updates chunk: expected mapping payload.",
                            extra={"chunk_type": type(chunk).__name__},
                        )
                    for value in chunk.values():
                        if isinstance(value, dict):
                            for tool_call_event in self._extract_update_tool_call_events(
                                value,
                                partial_tool_calls=partial_tool_calls,
                            ):
                                self._update_tool_state_from_event(tool_state, tool_call_event)
                                yield tool_call_event
                            self._merge_tool_state_payload(tool_state, value)
                else:
                    raise AgentStreamContractError(
                        message="Unexpected stream mode emitted by graph.",
                        extra={"mode": str(mode)},
                    )

        except Exception as exc:
            stream_error: Exception
            if isinstance(exc, ApplicationError):
                stream_error = exc
            else:
                stream_error = AgentUnhandledStreamError(
                    message=str(exc) or AgentUnhandledStreamError.message,
                    exception=exc,
                    extra={"exception_type": type(exc).__name__},
                )
            yield self._build_failed_event(
                response_id=response_id,
                error=stream_error,
            )
            return

        full_response = "".join(full_response_parts)
        reasoning_text = "".join(reasoning_parts)

        yield self._build_text_done_event(
            event_type="response.output_text.done",
            text=full_response,
        )
        if reasoning_text:
            yield self._build_text_done_event(
                event_type="response.reasoning.done",
                text=reasoning_text,
            )

        if incomplete_reason is not None:
            yield self._build_incomplete_event(
                response_id=response_id,
                reason=incomplete_reason,
            )
            return

        yield self._build_completed_event(
            response_id=response_id,
            model=model,
            response=full_response,
            usage=usage,
            tool_state=tool_state,
        )

    def _compile_agent_graph(
        self,
        llm: BaseChatModel,
        runnable_tools: list[BaseTool],
        system_prompt: str | None,
        tool_kinds: Mapping[str, str],
        *,
        tool_choice: dict[str, Any] | str | bool | None = None,
    ) -> CompiledAgentGraph:
        """Compila el grafo estándar LLM -> tools -> LLM."""
        bind_kwargs: dict[str, Any] = {}
        if tool_choice is not None:
            bind_kwargs["tool_choice"] = tool_choice
        model_with_tools = llm.bind_tools(runnable_tools, **bind_kwargs)
        builder = StateGraph(cast(Any, self.state_schema))
        system_prompt_prefix = (
            (SystemMessage(content=system_prompt),) if system_prompt else ()
        )

        async def agent_llm(
            state: StateT,
            config: RunnableConfig | None = None,
        ) -> Command:
            """Ejecuta el LLM con el historial actual y devuelve su nuevo mensaje."""
            state_chat_id = self._chat_id_from_state(state)
            budget = self._runtime_budget_from_state(state)
            if budget is not None:
                await budget.consume_agent_step(
                    chat_id=state_chat_id,
                    profiler=self._runtime_profiler_from_state(state),
                )
            llm_messages = (
                [*system_prompt_prefix, *state["messages"]]
                if system_prompt_prefix
                else state["messages"]
            )
            response = await model_with_tools.ainvoke(llm_messages, config=config)
            return Command(update={"messages": [response]})

        def should_continue(state: StateT) -> str:
            """Decide si el grafo debe pasar por el nodo de herramientas o finalizar."""
            messages = state["messages"]
            if not messages:
                return END

            last_message = messages[-1]
            if isinstance(last_message, AIMessage) and last_message.tool_calls:
                return "agent_tools"
            return END

        async def awrap_tool_call(tool_request: Any, execute: Any) -> Any:
            """Rodea la ejecución de una tool con budget, logging y métricas homogéneas."""
            execution_context = self._build_tool_execution_context(
                tool_request,
                tool_kinds=tool_kinds,
            )
            self._log_tool_node_enter(execution_context)
            started_at = time.perf_counter()
            outcome = "ok"
            try:
                if (
                    execution_context.budget is not None
                    and isinstance(execution_context.tool_name, str)
                ):
                    await execution_context.budget.consume_tool_call(
                        chat_id=execution_context.chat_id or "-",
                        tool_name=execution_context.tool_name,
                        profiler=execution_context.profiler,
                    )
                if execution_context.budget is not None:
                    async with execution_context.budget.semaphore:
                        response = await execute(tool_request)
                else:
                    response = await execute(tool_request)
            except Exception as exc:
                outcome = "error"
                self._log_tool_node_error(execution_context, exc)
                self._record_tool_execution(
                    execution_context,
                    started_at=started_at,
                    outcome=outcome,
                )
                return self._build_tool_execution_error_command(
                    execution_context=execution_context,
                    exc=exc,
                )

            self._log_tool_node_exit(execution_context, response)
            self._record_tool_execution(
                execution_context,
                started_at=started_at,
                outcome=outcome,
            )
            return response

        builder.add_node("agent_llm", agent_llm)
        builder.add_node(
            "agent_tools",
            ToolNode(
                runnable_tools,
                name="agent_tools",
                awrap_tool_call=awrap_tool_call,
            ),
        )
        builder.add_edge(START, "agent_llm")
        builder.add_conditional_edges(
            "agent_llm",
            should_continue,
            {
                "agent_tools": "agent_tools",
                END: END,
            },
        )
        builder.add_conditional_edges(
            "agent_tools",
            lambda state: "agent_llm",
            {
                "agent_llm": "agent_llm",
            },
        )
        return builder.compile()

    def _build_tool_execution_error_command(
        self,
        *,
        execution_context: ToolExecutionContext,
        exc: Exception,
    ) -> Command:
        """Convierte un fallo de ejecución de tool en un resultado consumible por el agente."""
        if not isinstance(execution_context.tool_name, str) or not execution_context.tool_name:
            raise AgentToolExecutionError(
                message="Tool execution failed before tool metadata could be resolved.",
                exception=exc,
                extra={
                    "tool_name": execution_context.tool_name,
                    "tool_call_id": execution_context.tool_call_id,
                    "call_kind": execution_context.call_kind,
                },
            ) from exc

        runtime = execution_context.runtime
        if runtime is None:
            raise AgentToolExecutionError(
                message=(
                    f"Tool execution failed for '{execution_context.tool_name}' before runtime was available."
                ),
                exception=exc,
                extra={
                    "tool_name": execution_context.tool_name,
                    "tool_call_id": execution_context.tool_call_id,
                    "call_kind": execution_context.call_kind,
                },
            ) from exc

        return build_tool_error_command(
            tool_name=execution_context.tool_name,
            runtime=cast(ToolRuntime, runtime),
            exc=exc,
        )

    def _build_tool_execution_context(
        self,
        tool_request: Any,
        *,
        tool_kinds: Mapping[str, str],
    ) -> ToolExecutionContext:
        """Deriva el contexto de ejecución de una tool a partir del request del ToolNode."""
        tool_call = getattr(tool_request, "tool_call", None)
        if not isinstance(tool_call, Mapping):
            raise AgentToolCallContractError(
                message="Tool request does not include a valid tool_call payload.",
                extra={"tool_request_type": type(tool_request).__name__},
            )
        runtime = getattr(tool_request, "runtime", None)
        tool = getattr(tool_request, "tool", None)

        tool_name = tool_call.get("name")
        if not isinstance(tool_name, str) or not tool_name.strip():
            raise AgentToolCallContractError(
                message="Tool request does not include a valid tool name.",
                extra={"tool_name_type": type(tool_name).__name__},
            )
        tool_name = tool_name.strip()

        tool_call_id = tool_call.get("id")
        if not isinstance(tool_call_id, str) or not tool_call_id.strip():
            raise AgentToolCallContractError(
                message="Tool request does not include a valid tool_call_id.",
                extra={"tool_call_id_type": type(tool_call_id).__name__},
            )
        tool_call_id = tool_call_id.strip()

        raw_tool_args = tool_call.get("args")
        tool_args = None
        if raw_tool_args is not None:
            if not isinstance(raw_tool_args, dict):
                raise AgentToolCallContractError(
                    message="Tool request args must be a JSON object when provided.",
                    extra={"tool_args_type": type(raw_tool_args).__name__},
                )
            tool_args = cast(dict[str, Any], raw_tool_args)

        state = getattr(runtime, "state", None)
        if not isinstance(state, dict):
            raise AgentRuntimeStateError(
                message="Tool runtime state is missing or invalid.",
                extra={"runtime_type": type(runtime).__name__},
            )
        chat_id = self._chat_id_from_state(state)
        profiler = self._runtime_profiler_from_state(state)
        budget = self._runtime_budget_from_state(state)
        call_kind = tool_kinds.get(tool_name)
        if not isinstance(call_kind, str):
            raise AgentToolCallContractError(
                message="Tool kind mapping is missing for tool execution.",
                extra={"tool_name": tool_name},
            )
        return ToolExecutionContext(
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            chat_id=chat_id,
            profiler=profiler,
            budget=budget,
            call_kind=call_kind,
            tool=tool,
            runtime=runtime,
            tool_args=tool_args,
        )

    def _log_tool_node_enter(self, execution_context: ToolExecutionContext) -> None:
        """Registra la entrada al nodo de tools con el nivel adecuado según el tipo de tool."""
        logger.debug(
            "tool_node_enter | tool={tool_name} tool_call_id={tool_call_id} chat_id={chat_id} "
            "tool_type={tool_type} runtime_type={runtime_type} args_keys={args_keys}",
            tool_name=execution_context.tool_name or "-",
            tool_call_id=execution_context.tool_call_id or "-",
            chat_id=execution_context.chat_id or "-",
            tool_type=type(execution_context.tool).__name__
            if execution_context.tool is not None
            else "-",
            runtime_type=type(execution_context.runtime).__name__
            if execution_context.runtime is not None
            else "-",
            args_keys=(
                sorted(str(key) for key in execution_context.tool_args.keys())
                if execution_context.tool_args is not None
                else "-"
            ),
        )

    def _log_tool_node_exit(
        self,
        execution_context: ToolExecutionContext,
        response: Any,
    ) -> None:
        """Registra la salida exitosa del nodo de tools."""
        logger.debug(
            "tool_node_exit | tool={tool_name} tool_call_id={tool_call_id} chat_id={chat_id} "
            "response_type={response_type}",
            tool_name=execution_context.tool_name or "-",
            tool_call_id=execution_context.tool_call_id or "-",
            chat_id=execution_context.chat_id or "-",
            response_type=type(response).__name__,
        )

    def _log_tool_node_error(
        self,
        execution_context: ToolExecutionContext,
        exc: Exception,
    ) -> None:
        """Registra un fallo durante la ejecución de una tool."""
        logger.opt(exception=exc).error(
            "tool_node_error | tool={tool_name} tool_call_id={tool_call_id} chat_id={chat_id} "
            "runtime_type={runtime_type}",
            tool_name=execution_context.tool_name or "-",
            tool_call_id=execution_context.tool_call_id or "-",
            chat_id=execution_context.chat_id or "-",
            runtime_type=type(execution_context.runtime).__name__
            if execution_context.runtime is not None
            else "-",
        )

    def _record_tool_execution(
        self,
        execution_context: ToolExecutionContext,
        *,
        started_at: float,
        outcome: str,
    ) -> None:
        """Persiste en el profiler las métricas de una ejecución concreta de tool."""
        if execution_context.profiler is None:
            return
        execution_context.profiler.record_call(
            call_kind=execution_context.call_kind,
            chat_id=execution_context.chat_id or "-",
            duration_ms=(time.perf_counter() - started_at) * 1000,
            outcome=outcome,
            tool_name=execution_context.tool_name,
            tool_type=type(execution_context.tool).__name__
            if execution_context.tool is not None
            else None,
        )
    async def _load_mcp_tools(
        self,
        *,
        mcp_servers: list[DBMCPServer],
        mcp_tool_session_scope: MCPToolSessionScope | None = None,
        profiler: RuntimeObserver,
    ) -> list[BaseTool]:
        """Carga herramientas MCP desde el scope de sesión abierto para la request actual."""
        if not mcp_servers:
            return []
        if self.mcp_client is None:
            raise MCPConfigError(message="MCP client is not configured for BaseAgent")
        if mcp_tool_session_scope is None:
            raise MCPConfigError(
                message=(
                    "MCP tool session scope is required when loading MCP tools. "
                    "Open a scope per request to keep connection isolation."
                )
            )

        started_at = time.perf_counter()
        try:
            tools, cached = await mcp_tool_session_scope.load_tools()
        except Exception as exc:
            profiler.record_cache_event(cache_name="mcp", hit=False)
            profiler.record_call(
                call_kind="mcp_load",
                chat_id=mcp_tool_session_scope.binding_scope,
                duration_ms=(time.perf_counter() - started_at) * 1000,
                outcome="error",
                cache_hit=False,
            )
            if isinstance(exc,(MCPConnectionError, MCPConfigError)):
                raise
            raise MCPConnectionError(
                message="Unable to load MCP tools for BaseAgent",
            ) from exc

        
        profiler.record_cache_event(cache_name="mcp", hit=cached)
        profiler.record_call(
            call_kind="mcp_load",
            chat_id=mcp_tool_session_scope.binding_scope,
            duration_ms=(time.perf_counter() - started_at) * 1000,
            outcome="cached" if cached else "ok",
            cache_hit=cached,
        )
        return tools
    @staticmethod
    def _build_tool_kind_mapping(
        runnable_tools: Sequence[BaseTool],
        *,
        mcp_tools: Sequence[BaseTool],
    ) -> dict[str, ToolKind]:
        """Construye el mapa `tool_name -> kind` usado por logs, métricas y estado."""
        mcp_tool_names = {tool.name for tool in mcp_tools}
        mapping: dict[str, ToolKind] = {}
        for runnable_tool in runnable_tools:
            if runnable_tool.name in mcp_tool_names:
                mapping[runnable_tool.name] = "tool_mcp"
            else:
                mapping[runnable_tool.name] = "tool_internal"
        return mapping

    @staticmethod
    def _merge_graph_extra_state(
        *,
        agent: CompiledAgentGraph,
        extra_state: dict[str, object] | None,
    ) -> dict[str, object] | None:
        """Fusiona `extra_state` con metadatos derivados del grafo compilado."""
        merged = dict(extra_state or {})
        tool_kinds = getattr(agent, "_agentic_tool_kinds", None)
        if isinstance(tool_kinds, Mapping):
            merged["tool_kinds"] = dict(tool_kinds)
        return merged or None

    @staticmethod
    def _runtime_budget_from_state(state: Mapping[str, object] | None) -> RuntimeBudget | None:
        """Extrae el budget de runtime desde el estado del grafo si está presente."""
        if state is None:
            return None
        if "runtime_budget" not in state:
            return None
        budget = state.get("runtime_budget")
        if isinstance(budget, RuntimeBudget):
            return budget
        raise AgentRuntimeStateError(
            message="Invalid runtime_budget found in agent state.",
            extra={"runtime_budget_type": type(budget).__name__},
        )

    @staticmethod
    def _runtime_profiler_from_state(
        state: Mapping[str, object] | None,
    ) -> RuntimeObserver | None:
        """Extrae el profiler de runtime desde el estado del grafo si está presente."""
        if state is None:
            return None
        if "runtime_profiler" not in state:
            return None
        profiler = state.get("runtime_profiler")
        if isinstance(profiler, RuntimeObserver):
            return profiler
        raise AgentRuntimeStateError(
            message="Invalid runtime_profiler found in agent state.",
            extra={"runtime_profiler_type": type(profiler).__name__},
        )

    @staticmethod
    def _chat_id_from_state(state: Mapping[str, object]) -> str:
        chat_id = state.get("chat_id")
        if isinstance(chat_id, str) and chat_id.strip():
            return chat_id
        raise AgentRuntimeStateError(
            message="Missing or invalid chat_id in agent state.",
            extra={"chat_id_type": type(chat_id).__name__},
        )

    @staticmethod
    def _build_initial_state(
        *,
        messages: list[BaseMessage],
        provider_name: str,
        model: str,
        chat_id: str,
        extra_state: dict[str, object] | None,
    ) -> dict[str, object]:
        """Construye el estado inicial del grafo validando claves reservadas."""
        if extra_state:
            reserved_keys = sorted(
                key
                for key in extra_state.keys()
                if key in BaseAgent._RESERVED_STATE_KEYS
            )
            if reserved_keys:
                raise AgentReservedStateKeyError(
                    extra={"keys": reserved_keys},
                )
        state: dict[str, object] = {
            "messages": messages,
            "chat_id": chat_id,
            "provider": provider_name,
            "model": model,
        }
        if extra_state:
            state.update(extra_state)
        return state

    @staticmethod
    def _coerce_message_stream_chunk(chunk: object) -> MessageStreamChunk | None:
        """Normaliza un chunk de streaming al formato interno esperado."""
        if not isinstance(chunk, tuple) or not chunk:
            raise AgentStreamContractError(
                message="Invalid stream chunk received from graph streaming.",
                extra={"chunk_type": type(chunk).__name__},
            )
        message = chunk[0]
        if not isinstance(message, (AIMessage, AIMessageChunk)):
            # LangGraph can emit non-AI messages (for example ToolMessage) in
            # `messages` mode. They are not useful for assistant text/tool-call
            # reconstruction, so we ignore them.
            return None
        metadata = (
            {str(key): value for key, value in chunk[1].items()}
            if len(chunk) > 1 and isinstance(chunk[1], dict)
            else None
        )
        return message, metadata

    @classmethod
    def _extract_text_from_content(cls, content: object) -> str:
        """Extrae texto legible desde contenidos simples o estructurados."""
        if content is None:
            return ""
        if isinstance(content, Sequence) and not isinstance(
            content, (str, bytes, bytearray)
        ):
            text_parts: list[str] = []
            for part in content:
                if isinstance(part, str):
                    text_parts.append(part)
                elif isinstance(part, Mapping):
                    part_type = part.get("type")
                    if part_type in {
                        "text",
                        "text-plain",
                        "input_text",
                        "output_text",
                    } and isinstance(part.get("text"), str):
                        text_value = part.get("text")
                        if isinstance(text_value, str):
                            text_parts.append(text_value)
                    elif isinstance(part.get("text"), str):
                        text_value = part.get("text")
                        if isinstance(text_value, str):
                            text_parts.append(text_value)
                    elif isinstance(part.get("output_text"), str):
                        output_text = part.get("output_text")
                        if isinstance(output_text, str):
                            text_parts.append(output_text)
                    elif "content" in part:
                        nested = cls._extract_text_from_content(part.get("content"))
                        if nested:
                            text_parts.append(nested)
                elif hasattr(part, "text"):
                    part_text = getattr(part, "text")
                    if isinstance(part_text, str):
                        text_parts.append(part_text)
            if text_parts:
                return "\n".join(text_parts)
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, Mapping):
            if "content" in content:
                return cls._extract_text_from_content(content.get("content"))
            if isinstance(content.get("text"), str):
                return cast(str, content.get("text"))
            if isinstance(content.get("output_text"), str):
                return cast(str, content.get("output_text"))
            return ""
        if hasattr(content, "content"):
            return cls._extract_text_from_content(getattr(content, "content"))
        return str(content)

    @staticmethod
    def _extract_stream_text_delta(
        chunk: MessageStreamChunk,
    ) -> tuple[str, str | None]:
        """Obtiene el delta de texto y, si aplica, el delta de razonamiento del chunk."""
        message, metadata = chunk
        tags = metadata.get("tags") if metadata is not None else None
        if isinstance(tags, list) and any(
            isinstance(tag, str) and tag in {"tool_internal", "tool-internal"}
            for tag in tags
        ):
            return "", None
        content_blocks = getattr(message, "content_blocks", None)
        if content_blocks:
            return Provider._extract_text_from_blocks(content_blocks)
        raw = getattr(message, "content", None)
        if raw is None:
            return "", None
        return BaseAgent._extract_text_from_content(raw), None

    @staticmethod
    def _tool_args_to_dict(raw_args: object, *, strict: bool = False) -> dict[str, Any]:
        """Convierte los argumentos de una tool a un objeto JSON manejable."""
        if isinstance(raw_args, Mapping):
            return cast(dict[str, Any], raw_args)
        if isinstance(raw_args, str):
            stripped = raw_args.strip()
            if not stripped:
                return {}
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, Mapping):
                    return cast(dict[str, Any], parsed)
            except json.JSONDecodeError:
                if strict:
                    raise AgentToolArgsJSONError(
                        extra={"raw_args": stripped[:256]},
                    ) from None
            return {"_raw": stripped}
        if raw_args is None:
            return {}
        if strict:
            raise AgentToolArgsTypeError(
                extra={"raw_args_type": type(raw_args).__name__},
            )
        return {"_raw": str(raw_args)}

    @classmethod
    def _extract_incomplete_reason(
        cls, message: AIMessage | AIMessageChunk
    ) -> IncompleteReason | None:
        """Busca en un mensaje la razón por la que una respuesta quedó incompleta."""
        candidates: list[object] = []
        for attr_name in ("response_metadata", "additional_kwargs"):
            attr_value = getattr(message, attr_name, None)
            if attr_value is not None:
                candidates.append(attr_value)

        for candidate in candidates:
            reason = cls._find_incomplete_reason(candidate)
            if reason is not None:
                return reason
        return None

    @classmethod
    def _find_incomplete_reason(cls, payload: object) -> IncompleteReason | None:
        """Recorre recursivamente un payload para localizar una razón de incompletitud."""
        if isinstance(payload, Mapping):
            for key in ("finish_reason", "stop_reason", "reason"):
                raw_reason = payload.get(key)
                mapped = cls._normalize_incomplete_reason(raw_reason)
                if mapped is not None:
                    return mapped
            for value in payload.values():
                mapped = cls._find_incomplete_reason(value)
                if mapped is not None:
                    return mapped
        elif isinstance(payload, Sequence) and not isinstance(
            payload, (str, bytes, bytearray)
        ):
            for value in payload:
                mapped = cls._find_incomplete_reason(value)
                if mapped is not None:
                    return mapped
        return None

    @staticmethod
    def _normalize_incomplete_reason(raw_reason: object) -> IncompleteReason | None:
        """Normaliza razones heterogéneas de providers a un conjunto cerrado interno."""
        if not isinstance(raw_reason, str):
            return None
        normalized = raw_reason.strip().lower()
        if normalized in {"length", "max_tokens", "max_completion_tokens", "token_limit"}:
            return "max_tokens"
        if normalized in {"content_filter", "content_filtered"}:
            return "content_filter"
        if normalized in {"timeout", "timed_out"}:
            return "timeout"
        return None

    @classmethod
    def _extract_update_tool_call_events(
        cls,
        payload: dict[str, object],
        *,
        partial_tool_calls: dict[str, PartialToolCallState],
    ) -> list[ResponseToolCallCreatedEvent]:
        """Extrae tool calls completas desde payloads de `updates` del grafo."""
        raw_messages = payload.get("messages")
        if raw_messages is None:
            return []
        if not isinstance(raw_messages, Sequence) or isinstance(
            raw_messages, (str, bytes, bytearray)
        ):
            raise AgentStreamContractError(
                message="Invalid updates payload: messages must be a sequence.",
                extra={"messages_type": type(raw_messages).__name__},
            )

        events: list[ResponseToolCallCreatedEvent] = []
        for message in raw_messages:
            if not isinstance(message, (AIMessage, AIMessageChunk)):
                # Updates payloads may include ToolMessage entries; only AI
                # messages can contain model-emitted tool call chunks.
                continue
            events.extend(
                cls._extract_stream_tool_call_events(
                    (message, None),
                    partial_tool_calls=partial_tool_calls,
                )
            )
        return events

    @classmethod
    def _extract_stream_tool_call_events(
        cls,
        chunk: MessageStreamChunk,
        *,
        partial_tool_calls: dict[str, PartialToolCallState],
    ) -> list[ResponseToolCallCreatedEvent]:
        """Convierte deltas de tool calls en eventos de creación normalizados."""
        message, metadata = chunk
        if cls._should_skip_tool_call_stream(metadata):
            return []

        events: list[ResponseToolCallCreatedEvent] = []
        for idx, raw_call in enumerate(cls._iter_stream_tool_calls(message)):
            call_name, call_id, call_args, call_index = _extract_tool_call_payload(
                raw_call
            )
            if call_id is None:
                # Some providers emit intermediate tool-call payloads without id,
                # including non-chunk AIMessage entries inside `updates` mode.
                # Ignore those entries until an id is available.
                continue
            tool_call_id = call_id
            partial_state = partial_tool_calls.setdefault(
                tool_call_id,
                PartialToolCallState(),
            )
            cls._update_partial_tool_call_state(
                partial_state,
                call_name=call_name,
                call_args=call_args,
            )
            if not cls._should_emit_partial_tool_call(
                message,
                partial_state=partial_state,
                call_args=call_args,
            ):
                if not isinstance(message, AIMessageChunk):
                    raise AgentToolCallContractError(
                        message="Incomplete tool call payload in non-streamed AIMessage.",
                        extra={
                            "tool_call_id": tool_call_id,
                            "has_name": bool(partial_state.name),
                            "has_arguments": bool(partial_state.arguments),
                        },
                    )
                continue
            events.append(
                cls._build_partial_tool_call_created_event(
                    tool_call_id=tool_call_id,
                    partial_state=partial_state,
                )
            )

        return events

    @staticmethod
    def _should_skip_tool_call_stream(
        metadata: dict[str, object] | None,
    ) -> bool:
        """Descarta chunks que no representan tool calls útiles para el consumidor externo."""
        tags = metadata.get("tags") if metadata is not None else None
        return isinstance(tags, list) and any(
            isinstance(tag, str) and tag in {"tool_internal", "tool-internal"}
            for tag in tags
        )

    @staticmethod
    def _iter_stream_tool_calls(message: AIMessage | AIMessageChunk) -> list[object]:
        """Obtiene las tool calls candidatas desde los campos soportados del mensaje."""
        if isinstance(message, AIMessageChunk) and message.tool_call_chunks:
            return list(message.tool_call_chunks)
        return list(message.tool_calls)

    @classmethod
    def _update_partial_tool_call_state(
        cls,
        partial_state: PartialToolCallState,
        *,
        call_name: str | None,
        call_args: dict[str, Any] | str | None,
    ) -> None:
        """Acumula nombre y argumentos parciales de una tool call en streaming."""
        if call_name is not None:
            partial_state.name = call_name
        if isinstance(call_args, Mapping):
            normalized_arguments: dict[str, Any] = {}
            for key, value in call_args.items():
                if not isinstance(key, str) or not key.strip():
                    raise AgentToolCallContractError(
                        message="Tool call argument keys must be non-empty strings.",
                        extra={"argument_key_type": type(key).__name__},
                    )
                normalized_arguments[key] = value
            partial_state.arguments = normalized_arguments
            return
        if isinstance(call_args, str):
            partial_state.arg_fragments.append(call_args)
            partial_state.arguments = cls._tool_args_to_dict(partial_state.args_text)

    @staticmethod
    def _should_emit_partial_tool_call(
        message: AIMessage | AIMessageChunk,
        *,
        partial_state: PartialToolCallState,
        call_args: dict[str, Any] | str | None,
    ) -> bool:
        """Determina si ya se puede emitir el evento `tool_call.created` reconstruido."""
        resolved_name = partial_state.name
        if not isinstance(resolved_name, str) or not resolved_name or partial_state.emitted:
            return False
        if not isinstance(message, AIMessageChunk):
            return True
        if not partial_state.arguments:
            return False
        if partial_state.arguments.get("_raw") and call_args is not None:
            return False
        return True

    @staticmethod
    def _build_partial_tool_call_created_event(
        *,
        tool_call_id: str,
        partial_state: PartialToolCallState,
    ) -> ResponseToolCallCreatedEvent:
        """Construye el evento normalizado de creación para una tool call ya reconstruida."""
        partial_state.emitted = True
        return {
            "type": "response.tool_call.created",
            "tool_call_id": tool_call_id,
            "name": cast(str, partial_state.name),
            "arguments": dict(partial_state.arguments),
        }

    @classmethod
    def _sanitize_stream_event_payload(
        cls,
        payload: Mapping[str, object],
    ) -> AgentStreamEvent:
        """Filtra y normaliza eventos `response.*` emitidos por tools o providers."""
        event_type = payload.get("type")
        if not isinstance(event_type, str):
            raise AgentStreamEventValidationError(
                message="Invalid response event payload: 'type' must be a string.",
                extra={"payload_keys": sorted(str(key) for key in payload.keys())},
            )
        if event_type not in cls._STREAM_EVENT_TYPES:
            raise AgentStreamEventValidationError(
                message="Unsupported response event type.",
                extra={"event_type": event_type},
            )
        sanitized_event: AgentStreamEvent | None = None
        if event_type == "response.created":
            sanitized_event = cls._sanitize_created_event(payload)
        elif event_type in {"response.output_text.delta", "response.reasoning.delta"}:
            sanitized_event = cls._sanitize_delta_event(
                payload,
                event_type=cast(
                    Literal["response.output_text.delta", "response.reasoning.delta"],
                    event_type,
                ),
            )
        elif event_type in {"response.output_text.done", "response.reasoning.done"}:
            sanitized_event = cls._sanitize_text_done_event(
                payload,
                event_type=cast(
                    Literal["response.output_text.done", "response.reasoning.done"],
                    event_type,
                ),
            )
        elif event_type == "response.tool_call.created":
            sanitized_event = cls._sanitize_tool_created_event(payload)
        elif event_type == "response.tool_stream.delta":
            sanitized_event = cls._sanitize_tool_delta_event(payload)
        elif event_type == "response.tool_call.completed":
            sanitized_event = cls._sanitize_tool_completed_event(payload)
        elif event_type == "response.tool_call.failed":
            sanitized_event = cls._sanitize_tool_failed_event(payload)
        elif event_type == "response.incomplete":
            sanitized_event = cls._sanitize_incomplete_event(payload)
        elif event_type == "response.failed":
            sanitized_event = cls._sanitize_failed_event(payload)
        elif event_type == "response.completed":
            sanitized_event = cls._sanitize_completed_event(payload)

        if sanitized_event is None:
            raise AgentStreamEventValidationError(
                message="Response event payload is invalid for its event type.",
                extra={"event_type": event_type},
            )
        return sanitized_event

    @classmethod
    def _sanitize_created_event(
        cls,
        payload: Mapping[str, object],
    ) -> ResponseCreatedEvent | None:
        """Valida y normaliza un evento `response.created` externo."""
        response_id = payload.get("response_id")
        model = payload.get("model")
        if not isinstance(response_id, str) or not isinstance(model, str):
            return None
        sanitized_created: ResponseCreatedEvent = {
            "type": "response.created",
            "response_id": response_id,
            "model": model,
        }
        sanitized_created.update(
            cast(
                Any,
                cls._merge_payload_event_fields(
                    payload,
                    reserved_keys={"type", "response_id", "model"},
                ),
            )
        )
        return sanitized_created

    @classmethod
    def _sanitize_delta_event(
        cls,
        payload: Mapping[str, object],
        *,
        event_type: Literal["response.output_text.delta", "response.reasoning.delta"],
    ) -> ResponseOutputTextDeltaEvent | ResponseReasoningDeltaEvent | None:
        """Valida y normaliza un evento incremental de texto o razonamiento."""
        delta = payload.get("delta")
        if not isinstance(delta, str):
            return None
        sanitized_event: dict[str, object] = {
            "type": event_type,
            "delta": delta,
        }
        sanitized_event.update(
            cls._merge_payload_event_fields(
                payload,
                reserved_keys={"type", "delta"},
            )
        )
        return cast(
            ResponseOutputTextDeltaEvent | ResponseReasoningDeltaEvent,
            sanitized_event,
        )

    @classmethod
    def _sanitize_text_done_event(
        cls,
        payload: Mapping[str, object],
        *,
        event_type: Literal["response.output_text.done", "response.reasoning.done"],
    ) -> ResponseOutputTextDoneEvent | ResponseReasoningDoneEvent | None:
        """Valida y normaliza un evento de cierre de texto o razonamiento."""
        text = payload.get("text")
        if not isinstance(text, str):
            return None
        sanitized_event: dict[str, object] = {
            "type": event_type,
            "text": text,
        }
        sanitized_event.update(
            cls._merge_payload_event_fields(
                payload,
                reserved_keys={"type", "text"},
            )
        )
        return cast(
            ResponseOutputTextDoneEvent | ResponseReasoningDoneEvent,
            sanitized_event,
        )

    @classmethod
    def _sanitize_tool_created_event(
        cls,
        payload: Mapping[str, object],
    ) -> ResponseToolCallCreatedEvent | None:
        """Valida y normaliza un evento de creación de tool call."""
        tool_call_id = payload.get("tool_call_id")
        name = payload.get("name")
        if not isinstance(tool_call_id, str) or not isinstance(name, str):
            return None
        sanitized_tool_created: ResponseToolCallCreatedEvent = {
            "type": "response.tool_call.created",
            "tool_call_id": tool_call_id,
            "name": name,
            "arguments": cls._tool_args_to_dict(payload.get("arguments"), strict=True),
        }
        sanitized_tool_created.update(
            cast(
                Any,
                cls._merge_payload_event_fields(
                    payload,
                    reserved_keys={"type", "tool_call_id", "name", "arguments"},
                ),
            )
        )
        return sanitized_tool_created

    @classmethod
    def _sanitize_tool_delta_event(
        cls,
        payload: Mapping[str, object],
    ) -> AgentStreamEvent | None:
        """Valida y normaliza un evento incremental emitido por una tool en ejecución."""
        tool_call_id = payload.get("tool_call_id")
        name = payload.get("name")
        delta = payload.get("delta")
        if (
            not isinstance(tool_call_id, str)
            or not isinstance(name, str)
            or not isinstance(delta, str)
        ):
            return None
        sanitized_tool_delta: dict[str, object] = {
            "type": "response.tool_stream.delta",
            "tool_call_id": tool_call_id,
            "name": name,
            "delta": delta,
        }
        sanitized_tool_delta.update(
            cls._merge_payload_event_fields(
                payload,
                reserved_keys={"type", "tool_call_id", "name", "delta"},
            )
        )
        return cast(AgentStreamEvent, sanitized_tool_delta)

    @classmethod
    def _sanitize_tool_completed_event(
        cls,
        payload: Mapping[str, object],
    ) -> ResponseToolCallCompletedEvent[Any] | None:
        """Valida y normaliza un evento de tool completada."""
        tool_call_id = payload.get("tool_call_id")
        name = payload.get("name")
        if not isinstance(tool_call_id, str) or not isinstance(name, str):
            return None
        sanitized_event: dict[str, object] = {
            "type": "response.tool_call.completed",
            "tool_call_id": tool_call_id,
            "name": name,
            "result": payload.get("result"),
        }
        sanitized_event.update(
            cls._merge_payload_event_fields(
                payload,
                reserved_keys={"type", "tool_call_id", "name", "result"},
            )
        )
        return cast(ResponseToolCallCompletedEvent[Any], sanitized_event)

    @classmethod
    def _sanitize_tool_failed_event(
        cls,
        payload: Mapping[str, object],
    ) -> AgentStreamEvent | None:
        """Valida y normaliza un evento de fallo de tool."""
        tool_call_id = payload.get("tool_call_id")
        name = payload.get("name")
        error_payload = payload.get("error")
        if (
            not isinstance(tool_call_id, str)
            or not isinstance(name, str)
            or not isinstance(error_payload, Mapping)
        ):
            return None
        code = error_payload.get("code")
        message = error_payload.get("message")
        if not isinstance(code, str) or not isinstance(message, str):
            return None
        sanitized_tool_failed: dict[str, object] = {
            "type": "response.tool_call.failed",
            "tool_call_id": tool_call_id,
            "name": name,
            "error": {"code": code, "message": message},
        }
        sanitized_tool_failed.update(
            cls._merge_payload_event_fields(
                payload,
                reserved_keys={"type", "tool_call_id", "name", "error"},
            )
        )
        return cast(AgentStreamEvent, sanitized_tool_failed)

    @classmethod
    def _sanitize_incomplete_event(
        cls,
        payload: Mapping[str, object],
    ) -> ResponseIncompleteEvent | None:
        """Valida y normaliza un evento de respuesta incompleta."""
        response_id = payload.get("response_id")
        reason = cls._normalize_incomplete_reason(payload.get("reason"))
        if not isinstance(response_id, str) or reason is None:
            return None
        sanitized_incomplete: ResponseIncompleteEvent = {
            "type": "response.incomplete",
            "response_id": response_id,
            "reason": reason,
        }
        sanitized_incomplete.update(
            cast(
                Any,
                cls._merge_payload_event_fields(
                    payload,
                    reserved_keys={"type", "response_id", "reason"},
                ),
            )
        )
        return sanitized_incomplete

    @classmethod
    def _sanitize_failed_event(
        cls,
        payload: Mapping[str, object],
    ) -> ResponseFailedEvent | None:
        """Valida y normaliza un evento terminal de error."""
        response_id = payload.get("response_id")
        error_payload = payload.get("error")
        if not isinstance(response_id, str) or not isinstance(error_payload, Mapping):
            return None
        code = error_payload.get("code")
        message = error_payload.get("message")
        if not isinstance(code, str) or not isinstance(message, str):
            return None
        sanitized_failed: ResponseFailedEvent = {
            "type": "response.failed",
            "response_id": response_id,
            "error": {"code": code, "message": message},
        }
        sanitized_failed.update(
            cast(
                Any,
                cls._merge_payload_event_fields(
                    payload,
                    reserved_keys={"type", "response_id", "error"},
                ),
            )
        )
        return sanitized_failed

    @classmethod
    def _sanitize_completed_event(
        cls,
        payload: Mapping[str, object],
    ) -> ResponseCompletedEvent | None:
        """Valida y normaliza un evento terminal de respuesta completada."""
        response_id = payload.get("response_id")
        model = payload.get("model")
        full_response = payload.get("full_response")
        usage_payload = payload.get("usage")
        if (
            not isinstance(response_id, str)
            or not isinstance(model, str)
            or not isinstance(full_response, str)
            or not isinstance(usage_payload, Mapping)
        ):
            return None
        sanitized_completed: ResponseCompletedEvent = {
            "type": "response.completed",
            "response_id": response_id,
            "model": model,
            "full_response": full_response,
            "usage": {
                key: value
                for key, value in usage_payload.items()
                if isinstance(key, str)
            },
        }
        if len(sanitized_completed["usage"]) != len(usage_payload):
            raise AgentStreamEventValidationError(
                message="response.completed usage contains non-string keys.",
            )
        tool_results = cls._coerce_tool_results_mapping(payload.get("tool_results"))
        if tool_results:
            sanitized_completed["tool_results"] = tool_results
        sanitized_completed.update(
            cast(
                Any,
                cls._merge_payload_event_fields(
                    payload,
                    reserved_keys={
                        "type",
                        "response_id",
                        "model",
                        "full_response",
                        "usage",
                        "tool_results",
                    },
                ),
            )
        )
        return sanitized_completed

    @classmethod
    def _merge_payload_event_fields(
        cls,
        payload: Mapping[str, object],
        *,
        reserved_keys: set[str] | None = None,
    ) -> dict[str, object]:
        """Mezcla metadatos soportados y campos extra preservando el contrato del evento."""
        merged: dict[str, object] = {}
        excluded_keys = set(reserved_keys or ())
        for key in cls._STREAM_METADATA_KEYS:
            if key in excluded_keys:
                continue
            value = payload.get(key)
            if value is None:
                continue
            merged[key] = value
        for key, value in payload.items():
            if (
                key in excluded_keys
                or key in cls._STREAM_METADATA_KEYS
            ):
                continue
            merged[key] = value
        return merged

    @staticmethod
    def _append_tool_result_entry(
        tool_results: dict[str, list[ToolResultEntry[Any]]],
        *,
        tool_name: str,
        entry: ToolResultEntry[Any],
    ) -> None:
        """Inserta o reemplaza un resultado de tool por `tool_call_id`."""
        entries = tool_results.setdefault(tool_name, [])
        for index, existing_entry in enumerate(entries):
            if existing_entry["tool_call_id"] == entry["tool_call_id"]:
                entries[index] = entry
                return
        entries.append(entry)

    @classmethod
    def _coerce_tool_results_mapping(
        cls, raw_tool_results: object
    ) -> dict[str, list[ToolResultEntry[Any]]]:
        """Acepta sólo el formato actual de `tool_results` y descarta payloads fuera de contrato."""
        if not isinstance(raw_tool_results, Mapping):
            raise AgentStreamContractError(
                message="tool_results must be a mapping.",
                extra={"tool_results_type": type(raw_tool_results).__name__},
            )

        normalized_mapping: dict[str, list[ToolResultEntry[Any]]] = {}
        for tool_name, value in raw_tool_results.items():
            if not isinstance(tool_name, str) or not tool_name:
                raise AgentStreamContractError(
                    message="tool_results keys must be non-empty strings.",
                    extra={"tool_name_type": type(tool_name).__name__},
                )
            if not isinstance(value, Sequence) or isinstance(
                value, (str, bytes, bytearray)
            ):
                raise AgentStreamContractError(
                    message="tool_results entries must be sequences of mappings.",
                    extra={
                        "tool_name": tool_name,
                        "entry_type": type(value).__name__,
                    },
                )
            for item in value:
                if not isinstance(item, Mapping):
                    raise AgentStreamContractError(
                        message="tool_results item must be a mapping.",
                        extra={"tool_name": tool_name, "item_type": type(item).__name__},
                    )
                tool_call_id = item.get("tool_call_id")
                if not isinstance(tool_call_id, str) or not tool_call_id:
                    raise AgentStreamContractError(
                        message="tool_results item requires non-empty tool_call_id.",
                        extra={"tool_name": tool_name},
                    )
                cls._append_tool_result_entry(
                    normalized_mapping,
                    tool_name=tool_name,
                    entry={
                        "tool_call_id": tool_call_id,
                        "result": item.get("result"),
                    },
                )
        return normalized_mapping

    @classmethod
    def _merge_tool_results_into_state(
        cls,
        tool_state: ToolStateAccumulator,
        tool_results: Mapping[str, Sequence[ToolResultEntry[Any]]],
    ) -> None:
        """Fusiona resultados normalizados de tools en el acumulador interno del stream."""
        for tool_name, entries in tool_results.items():
            for entry in entries:
                cls._append_tool_result_entry(
                    tool_state.results_by_tool_name,
                    tool_name=tool_name,
                    entry={
                        "tool_call_id": entry["tool_call_id"],
                        "result": entry.get("result"),
                    },
                )

    @classmethod
    def _merge_tool_usage_into_state(
        cls,
        tool_state: ToolStateAccumulator,
        raw_tool_usage: object,
    ) -> None:
        """Fusiona métricas de uso de tools dentro del acumulador interno."""
        if raw_tool_usage is None:
            return
        if not isinstance(raw_tool_usage, Mapping):
            raise AgentStreamContractError(
                message="tool_usage must be a mapping.",
                extra={"tool_usage_type": type(raw_tool_usage).__name__},
            )
        typed_tool_usage = cast(dict[str, object], dict(raw_tool_usage))
        for tool_name, tool_usage in typed_tool_usage.items():
            if not tool_name:
                raise AgentStreamContractError(
                    message="tool_usage keys must be non-empty strings.",
                    extra={"tool_name_type": type(tool_name).__name__},
                )
            if not isinstance(tool_usage, Mapping):
                raise AgentStreamContractError(
                    message="tool_usage entries must be mappings.",
                    extra={"tool_name": tool_name, "usage_type": type(tool_usage).__name__},
                )
            normalized_usage = coerce_usage_mapping(
                {str(key): value for key, value in tool_usage.items()}
            )
            if not normalized_usage:
                raise AgentStreamContractError(
                    message="tool_usage entry could not be normalized.",
                    extra={"tool_name": tool_name},
                )
            tool_state.usage_by_tool_name[tool_name] = add_usages(
                tool_state.usage_by_tool_name.get(tool_name, {}),
                normalized_usage,
            )

    @classmethod
    def _completed_tool_results_from_event(
        cls,
        payload: Mapping[str, object],
    ) -> dict[str, list[ToolResultEntry[Any]]]:
        """Extrae resultados persistibles desde un evento `tool_call.completed` válido."""
        if payload.get("type") != "response.tool_call.completed":
            return {}
        tool_name = cast(str, payload["name"])
        tool_call_id = cast(str, payload["tool_call_id"])
        return {
            tool_name: [
                {
                    "tool_call_id": tool_call_id,
                    "result": payload.get("result"),
                }
            ]
        }

    @classmethod
    def _merge_tool_state_payload(
        cls, tool_state: ToolStateAccumulator, payload: dict[str, object]
    ) -> None:
        """Fusiona en el estado acumulado los resultados de tools presentes en un payload."""
        raw_tool_results = payload.get("tool_results")
        if raw_tool_results is not None:
            cls._merge_tool_results_into_state(
                tool_state,
                cls._coerce_tool_results_mapping(raw_tool_results),
            )
        cls._merge_tool_usage_into_state(tool_state, payload.get("tool_usage"))

    @classmethod
    def _update_tool_state_from_event(
        cls,
        tool_state: ToolStateAccumulator,
        payload: Mapping[str, object],
    ) -> None:
        """Actualiza el acumulador interno a partir de un evento de tool completada."""
        cls._merge_tool_results_into_state(
            tool_state,
            cls._completed_tool_results_from_event(payload),
        )

    def _build_created_event(
        self,
        *,
        response_id: str,
        model: str,
    ) -> ResponseCreatedEvent:
        """Build the initial response-created event."""
        return {
            "type": "response.created",
            "response_id": response_id,
            "model": model,
        }

    def _build_delta_event(
        self,
        *,
        event_type: Literal["response.output_text.delta", "response.reasoning.delta"],
        delta: str,
    ) -> ResponseOutputTextDeltaEvent | ResponseReasoningDeltaEvent:
        """Build a generic delta event."""
        return cast(
            ResponseOutputTextDeltaEvent | ResponseReasoningDeltaEvent,
            {
                "type": event_type,
                "delta": delta,
            },
        )

    def _build_text_done_event(
        self,
        *,
        event_type: Literal["response.output_text.done", "response.reasoning.done"],
        text: str,
    ) -> ResponseOutputTextDoneEvent | ResponseReasoningDoneEvent:
        """Build a generic `*.done` event."""
        return cast(
            ResponseOutputTextDoneEvent | ResponseReasoningDoneEvent,
            {
                "type": event_type,
                "text": text,
            },
        )

    def _build_completed_event(
        self,
        *,
        response_id: str,
        model: str,
        response: str,
        usage: dict[str, Any],
        tool_state: ToolStateAccumulator,
    ) -> ResponseCompletedEvent:
        """Construye el evento final de respuesta completada."""
        combined_usage = add_usages(usage, *tool_state.usage_by_tool_name.values())
        event_payload: ResponseCompletedEvent = {
            "type": "response.completed",
            "response_id": response_id,
            "model": model,
            "full_response": response,
            "usage": combined_usage,
        }
        if tool_state.results_by_tool_name:
            event_payload["tool_results"] = {
                tool_name: [
                    {
                        "tool_call_id": entry["tool_call_id"],
                        "result": entry["result"],
                    }
                    for entry in entries
                ]
                for tool_name, entries in tool_state.results_by_tool_name.items()
            }

        return event_payload

    def _build_incomplete_event(
        self,
        *,
        response_id: str,
        reason: IncompleteReason,
    ) -> ResponseIncompleteEvent:
        """Construye el evento que indica una respuesta incompleta."""
        return {
            "type": "response.incomplete",
            "response_id": response_id,
            "reason": reason,
        }

    def _build_failed_event(
        self,
        *,
        response_id: str,
        error: Exception,
    ) -> ResponseFailedEvent:
        """Construye el evento de error terminal de la respuesta."""
        return {
            "type": "response.failed",
            "response_id": response_id,
            "error": {
                "code": error.code if isinstance(error, ApplicationError) else error.__class__.__name__,
                "message": error.message if isinstance(error, ApplicationError) else str(error),
            },
        }
