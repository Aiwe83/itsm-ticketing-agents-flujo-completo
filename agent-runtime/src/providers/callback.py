import json
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import ClassVar
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import BaseMessage
from langchain_core.outputs import (
    ChatGeneration,
    ChatGenerationChunk,
    Generation,
    GenerationChunk,
    LLMResult,
)
from loguru import logger

GenerationLike = Generation | ChatGeneration | GenerationChunk | ChatGenerationChunk


@dataclass(slots=True)
class _RunState:
    started_at: float
    metadata: dict[str, object]


@dataclass(slots=True)
class LLMCallLogger(BaseCallbackHandler):
    """Log duration, full response, tool calls and token usage for each model call."""

    _TOOL_ARGUMENTS_PREVIEW: ClassVar[int] = 500

    provider_label: str | None = None
    _starts: dict[UUID, _RunState] = field(default_factory=dict, init=False)

    @staticmethod
    def _coerce_metadata(
        metadata: Mapping[str, object] | None,
    ) -> dict[str, object]:
        return dict(metadata or {})

    @staticmethod
    def _read_int(value: object) -> int:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            try:
                return int(float(value))
            except ValueError:
                return 0
        return 0

    @staticmethod
    def _read_metadata_text(metadata: Mapping[str, object], key: str) -> str | None:
        value = metadata.get(key)
        return value if isinstance(value, str) else None

    @staticmethod
    def _first_generation(response: LLMResult) -> GenerationLike | None:
        if not response.generations or not response.generations[0]:
            return None
        return response.generations[0][0]

    @staticmethod
    def _json_preview(value: object, *, limit: int) -> str:
        try:
            serialized = json.dumps(value, ensure_ascii=False, default=str)
        except TypeError:
            serialized = str(value)
        if len(serialized) <= limit:
            return serialized
        return f"{serialized[:limit]}..."

    @classmethod
    def _extract_response_text(cls, response: LLMResult) -> str:
        generation = cls._first_generation(response)
        if generation is None:
            return ""

        if isinstance(generation, ChatGeneration):
            return generation.text

        text = getattr(generation, "text", "")
        return text if isinstance(text, str) else ""

    @staticmethod
    def _message_from_generation(generation: GenerationLike | None) -> object | None:
        if isinstance(generation, ChatGeneration):
            return generation.message
        if isinstance(generation, ChatGenerationChunk):
            return generation.message
        return None

    @classmethod
    def _extract_tool_calls_summary(cls, response: LLMResult) -> str:
        generation = cls._first_generation(response)
        message = cls._message_from_generation(generation)
        raw_tool_calls = getattr(message, "tool_calls", None)
        if not isinstance(raw_tool_calls, list) or not raw_tool_calls:
            return ""

        summaries: list[str] = []
        for index, raw_tool_call in enumerate(raw_tool_calls, start=1):
            if isinstance(raw_tool_call, Mapping):
                name = raw_tool_call.get("name") or raw_tool_call.get("type") or "unknown"
                tool_call_id = raw_tool_call.get("id")
                args = raw_tool_call.get("args")
            else:
                name = (
                    getattr(raw_tool_call, "name", None)
                    or getattr(raw_tool_call, "type", None)
                    or "unknown"
                )
                tool_call_id = getattr(raw_tool_call, "id", None)
                args = getattr(raw_tool_call, "args", None)

            id_suffix = (
                f" id={tool_call_id}"
                if isinstance(tool_call_id, str) and tool_call_id
                else ""
            )
            summaries.append(
                f"{index}. {name}{id_suffix} "
                f"args={cls._json_preview(args or {}, limit=cls._TOOL_ARGUMENTS_PREVIEW)}"
            )
        return "; ".join(summaries)

    @classmethod
    def _usage_from_mapping(cls, raw_usage: object) -> tuple[int, int, int] | None:
        if not isinstance(raw_usage, Mapping):
            return None

        input_tokens = cls._read_int(
            raw_usage.get("prompt_tokens")
            or raw_usage.get("input_tokens")
            or raw_usage.get("input")
        )
        output_tokens = cls._read_int(
            raw_usage.get("completion_tokens")
            or raw_usage.get("output_tokens")
            or raw_usage.get("output")
        )
        total_tokens = cls._read_int(raw_usage.get("total_tokens") or raw_usage.get("total"))
        if not total_tokens:
            total_tokens = input_tokens + output_tokens
        if not input_tokens and not output_tokens and not total_tokens:
            return None
        return input_tokens, output_tokens, total_tokens

    @classmethod
    def _extract_token_usage(cls, response: LLMResult) -> tuple[int, int, int]:
        """Return (input_tokens, output_tokens, total_tokens)."""
        generation = cls._first_generation(response)
        message = cls._message_from_generation(generation)
        response_metadata = getattr(message, "response_metadata", None)
        generation_info = getattr(generation, "generation_info", None)
        llm_output = response.llm_output

        usage_candidates = [
            getattr(message, "usage_metadata", None),
            response_metadata.get("token_usage")
            if isinstance(response_metadata, Mapping)
            else None,
            response_metadata.get("usage") if isinstance(response_metadata, Mapping) else None,
            generation_info.get("token_usage")
            if isinstance(generation_info, Mapping)
            else None,
            generation_info.get("usage") if isinstance(generation_info, Mapping) else None,
            llm_output.get("token_usage") if isinstance(llm_output, Mapping) else None,
            llm_output.get("usage") if isinstance(llm_output, Mapping) else None,
        ]
        for raw_usage in usage_candidates:
            usage = cls._usage_from_mapping(raw_usage)
            if usage is not None:
                return usage

        return 0, 0, 0

    def on_chat_model_start(
        self,
        serialized: dict[str, object],
        messages: list[list[BaseMessage]],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, object] | None = None,
        **kwargs: object,
    ) -> None:
        del serialized, messages, parent_run_id, tags, kwargs
        self._starts[run_id] = _RunState(
            started_at=time.perf_counter(),
            metadata=self._coerce_metadata(metadata),
        )

    def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        **kwargs: object,
    ) -> None:
        del parent_run_id, tags, kwargs
        state = self._starts.pop(run_id, None)
        if state is None:
            return

        duration_ms = (time.perf_counter() - state.started_at) * 1000
        provider_label = (
            self.provider_label
            or self._read_metadata_text(state.metadata, "provider")
            or "LLM"
        )
        model = self._read_metadata_text(state.metadata, "model") or "unknown"

        text = self._extract_response_text(response)
        tool_calls_summary = self._extract_tool_calls_summary(response)
        input_tokens, output_tokens, total_tokens = self._extract_token_usage(response)

        tool_calls_suffix = (
            f" | tool_calls={tool_calls_summary}" if tool_calls_summary else ""
        )

        logger.info(
            "{provider_label} [{model}] {duration_ms:.0f}ms | "
            "in={input_tokens} out={output_tokens} total={total_tokens} tokens | "
            "response={response!r}{tool_calls_suffix}",
            provider_label=provider_label,
            model=model,
            duration_ms=duration_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            response=text,
            tool_calls_suffix=tool_calls_suffix,
        )

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        **kwargs: object,
    ) -> None:
        del parent_run_id, tags, kwargs
        state = self._starts.pop(run_id, None)
        if state is None:
            return

        duration_ms = (time.perf_counter() - state.started_at) * 1000
        provider_label = (
            self.provider_label
            or self._read_metadata_text(state.metadata, "provider")
            or "LLM"
        )
        model = self._read_metadata_text(state.metadata, "model") or "unknown"

        logger.warning(
            "{provider_label} [{model}] failed after {duration_ms:.0f}ms | "
            "{error_type}: {error_msg}",
            provider_label=provider_label,
            model=model,
            duration_ms=duration_ms,
            error_type=type(error).__name__,
            error_msg=str(error),
        )
