from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from core.errors import RuntimeLimitExceededError
from core.logger import get_logger
from core.settings import AgentRuntimeSettings

logger = get_logger()


class RuntimeObserver:
    @property
    def enabled(self) -> bool:
        return False

    def set_root_agent(self, *, agent_id: str | None, agent_name: str | None) -> None:
        return None

    def set_context(self, *, context_messages: int, history_bytes: int) -> None:
        return None

    @contextmanager
    def measure_phase(
        self,
        phase: str,
        *,
        chat_id: str,
        agent_id: str | None = None,
        agent_name: str | None = None,
        parent_tool_call_id: str | None = None,
        agent_invocation_id: str | None = None,
    ) -> Iterator[None]:
        del (
            phase,
            chat_id,
            agent_id,
            agent_name,
            parent_tool_call_id,
            agent_invocation_id,
        )
        yield

    def record_call(
        self,
        *,
        call_kind: str,
        chat_id: str,
        duration_ms: float,
        outcome: str,
        tool_name: str | None = None,
        tool_type: str | None = None,
        agent_id: str | None = None,
        agent_name: str | None = None,
        parent_tool_call_id: str | None = None,
        agent_invocation_id: str | None = None,
        cache_hit: bool | None = None,
    ) -> None:
        del (
            call_kind,
            chat_id,
            duration_ms,
            outcome,
            tool_name,
            tool_type,
            agent_id,
            agent_name,
            parent_tool_call_id,
            agent_invocation_id,
            cache_hit,
        )
        return None

    def record_cache_event(self, *, cache_name: str, hit: bool) -> None:
        del cache_name, hit
        return None

    def record_budget_exhausted(
        self,
        *,
        limit_name: str,
        chat_id: str,
        detail: dict[str, Any] | None = None,
    ) -> None:
        del limit_name, chat_id, detail
        return None

    def finish(
        self,
        *,
        chat_id: str,
        outcome: str,
        response_chars: int,
        tool_calls: int,
    ) -> None:
        del chat_id, outcome, response_chars, tool_calls
        return None


class NoopRuntimeObserver(RuntimeObserver):
    __slots__ = ()


@dataclass(slots=True)
class RuntimeBudget:
    root_chat_id: str
    deadline_monotonic: float
    remaining_agent_steps: int
    remaining_tool_calls: int
    semaphore: asyncio.Semaphore
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @classmethod
    def from_settings(
        cls,
        *,
        settings: AgentRuntimeSettings,
        root_chat_id: str,
    ) -> RuntimeBudget:
        timeout_seconds = max(1, int(settings.max_total_runtime_seconds))
        return cls(
            root_chat_id=root_chat_id,
            deadline_monotonic=time.monotonic() + timeout_seconds,
            remaining_agent_steps=max(1, int(settings.max_agent_steps)),
            remaining_tool_calls=max(1, int(settings.max_tool_calls)),
            semaphore=asyncio.Semaphore(max(1, int(settings.max_parallel_tool_calls))),
        )

    def remaining_seconds(self) -> float:
        return max(0.0, self.deadline_monotonic - time.monotonic())

    async def consume_agent_step(
        self,
        *,
        chat_id: str,
        profiler: RuntimeObserver | None = None,
    ) -> None:
        await self._consume(
            limit_name="max_agent_steps",
            chat_id=chat_id,
            counter_attr="remaining_agent_steps",
            profiler=profiler,
        )

    async def consume_tool_call(
        self,
        *,
        chat_id: str,
        tool_name: str,
        profiler: RuntimeObserver | None = None,
    ) -> None:
        await self._consume(
            limit_name="max_tool_calls",
            chat_id=chat_id,
            counter_attr="remaining_tool_calls",
            profiler=profiler,
            detail={"tool_name": tool_name},
        )

    async def _consume(
        self,
        *,
        limit_name: str,
        chat_id: str,
        counter_attr: str,
        profiler: RuntimeObserver | None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        async with self.lock:
            remaining = int(getattr(self, counter_attr))
            if remaining <= 0:
                if profiler is not None:
                    profiler.record_budget_exhausted(
                        limit_name=limit_name,
                        chat_id=chat_id,
                        detail=detail,
                    )
                raise RuntimeLimitExceededError(
                    message=f"Agent runtime exceeded configured limit '{limit_name}'.",
                    extra={"chat_id": chat_id, **(detail or {})},
                )
            setattr(self, counter_attr, remaining - 1)


@dataclass(slots=True)
class AgentRuntimeProfiler(RuntimeObserver):
    settings: AgentRuntimeSettings
    root_chat_id: str
    model: str
    provider: str
    request_started_at: float = field(default_factory=time.perf_counter)
    root_agent_id: str | None = None
    root_agent_name: str | None = None
    context_messages: int = 0
    history_bytes: int = 0
    tool_calls: int = 0
    mcp_cache_hits: int = 0
    mcp_cache_misses: int = 0

    @property
    def enabled(self) -> bool:
        return bool(self.settings.profiling_enabled)

    def set_root_agent(self, *, agent_id: str | None, agent_name: str | None) -> None:
        if not self.enabled:
            return
        self.root_agent_id = agent_id
        self.root_agent_name = agent_name

    def set_context(self, *, context_messages: int, history_bytes: int) -> None:
        if not self.enabled:
            return
        self.context_messages = context_messages
        self.history_bytes = history_bytes

    @contextmanager
    def measure_phase(
        self,
        phase: str,
        *,
        chat_id: str,
        agent_id: str | None = None,
        agent_name: str | None = None,
        parent_tool_call_id: str | None = None,
        agent_invocation_id: str | None = None,
    ) -> Iterator[None]:
        if not self.enabled:
            yield
            return

        started_at = time.perf_counter()
        outcome = "ok"
        try:
            yield
        except Exception:
            outcome = "error"
            raise
        finally:
            duration_ms = (time.perf_counter() - started_at) * 1000
            if duration_ms >= float(self.settings.slow_log_threshold_ms) or outcome != "ok":
                logger.info(
                    "agent_runtime_phase_profile | root_chat_id={root_chat_id} chat_id={chat_id} "
                    "phase={phase} duration_ms={duration_ms:.0f} outcome={outcome} "
                    "agent_id={agent_id} agent_name={agent_name} parent_tool_call_id={parent_tool_call_id} "
                    "agent_invocation_id={agent_invocation_id} model={model} provider={provider}",
                    root_chat_id=self.root_chat_id,
                    chat_id=chat_id,
                    phase=phase,
                    duration_ms=duration_ms,
                    outcome=outcome,
                    agent_id=agent_id or "-",
                    agent_name=agent_name or "-",
                    parent_tool_call_id=parent_tool_call_id or "-",
                    agent_invocation_id=agent_invocation_id or "-",
                    model=self.model,
                    provider=self.provider,
                )

    def record_call(
        self,
        *,
        call_kind: str,
        chat_id: str,
        duration_ms: float,
        outcome: str,
        tool_name: str | None = None,
        tool_type: str | None = None,
        agent_id: str | None = None,
        agent_name: str | None = None,
        parent_tool_call_id: str | None = None,
        agent_invocation_id: str | None = None,
        cache_hit: bool | None = None,
    ) -> None:
        if not self.enabled:
            return

        if call_kind in {"tool_internal", "tool_mcp"}:
            self.tool_calls += 1

        logger.info(
            "agent_runtime_call_profile | root_chat_id={root_chat_id} chat_id={chat_id} "
            "call_kind={call_kind} duration_ms={duration_ms:.0f} outcome={outcome} "
            "tool_name={tool_name} tool_type={tool_type} agent_id={agent_id} agent_name={agent_name} "
            "parent_tool_call_id={parent_tool_call_id} agent_invocation_id={agent_invocation_id} "
            "cache_hit={cache_hit} model={model} provider={provider}",
            root_chat_id=self.root_chat_id,
            chat_id=chat_id,
            call_kind=call_kind,
            duration_ms=duration_ms,
            outcome=outcome,
            tool_name=tool_name or "-",
            tool_type=tool_type or "-",
            agent_id=agent_id or "-",
            agent_name=agent_name or "-",
            parent_tool_call_id=parent_tool_call_id or "-",
            agent_invocation_id=agent_invocation_id or "-",
            cache_hit="-" if cache_hit is None else str(cache_hit).lower(),
            model=self.model,
            provider=self.provider,
        )

    def record_cache_event(self, *, cache_name: str, hit: bool) -> None:
        if not self.enabled:
            return

        if cache_name == "mcp":
            if hit:
                self.mcp_cache_hits += 1
            else:
                self.mcp_cache_misses += 1

    def record_budget_exhausted(
        self,
        *,
        limit_name: str,
        chat_id: str,
        detail: dict[str, Any] | None = None,
    ) -> None:
        if not self.enabled:
            return

        logger.warning(
            "agent_runtime_budget_exhausted | root_chat_id={root_chat_id} chat_id={chat_id} "
            "limit_name={limit_name} detail={detail} model={model} provider={provider}",
            root_chat_id=self.root_chat_id,
            chat_id=chat_id,
            limit_name=limit_name,
            detail=detail or {},
            model=self.model,
            provider=self.provider,
        )

    def finish(
        self,
        *,
        chat_id: str,
        outcome: str,
        response_chars: int,
        tool_calls: int,
    ) -> None:
        if not self.enabled:
            return

        duration_ms = (time.perf_counter() - self.request_started_at) * 1000
        logger.info(
            "agent_runtime_profile | root_chat_id={root_chat_id} chat_id={chat_id} "
            "duration_ms={duration_ms:.0f} outcome={outcome} model={model} provider={provider} "
            "agent_id={agent_id} agent_name={agent_name} context_messages={context_messages} "
            "history_bytes={history_bytes} response_chars={response_chars} tool_calls={tool_calls} "
            "mcp_cache_hits={mcp_cache_hits} mcp_cache_misses={mcp_cache_misses}",
            root_chat_id=self.root_chat_id,
            chat_id=chat_id,
            duration_ms=duration_ms,
            outcome=outcome,
            model=self.model,
            provider=self.provider,
            agent_id=self.root_agent_id or "-",
            agent_name=self.root_agent_name or "-",
            context_messages=self.context_messages,
            history_bytes=self.history_bytes,
            response_chars=response_chars,
            tool_calls=tool_calls,
            mcp_cache_hits=self.mcp_cache_hits,
            mcp_cache_misses=self.mcp_cache_misses,
        )
