import asyncio
import json
import time
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Iterator, Mapping, Sequence
from typing import Any, AsyncGenerator, Generator, Protocol, TypedDict, cast, overload, runtime_checkable

import msgspec
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
)
from langchain_core.messages.content import (
    ContentBlock,
    PlainTextContentBlock,
    ReasoningContentBlock,
    TextContentBlock,
)
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from models.openai_compatible.chat_completions.input import (
    ChatCompletionsRequestPayload,
)
from models.openai_compatible.chat_completions.output import (
    ChatCompletionMessageToolCall,
    ChatCompletionMessageToolCallDict,
    ChatCompletionResponse,
    ChatCompletionStreamFunctionCallDict,
    ChatCompletionStreamDeltaDict,
    ChatCompletionStreamResponse,
    ChatCompletionStreamToolCallDict,
    CompletionUsage,
    CompletionUsageDict,
)
from models.openai_compatible.responses.input import (
    ResponsesRequestPayload,
)
from models.openai_compatible.responses.output import (
    ResponseObjectDict,
    ResponsesResponsePayload,
    ResponsesStreamEvent,
)
class ValidateResponse(TypedDict):
    is_valid: bool
    """Indica si es válido el payload"""
    error_message: str | None


class NormalizedUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int
    input_details: dict[str, Any]
    output_details: dict[str, Any]


class ToolCallStreamState(TypedDict):
    item_id: str
    output_index: int
    call_id: str
    name: str
    args: str


@runtime_checkable
class SupportsModelDump(Protocol):
    def model_dump(self) -> Mapping[str, object]: ...


@runtime_checkable
class SupportsModelDumpJSON(Protocol):
    def model_dump_json(self, *, exclude_none: bool = False) -> str: ...


class ModelRunnable(Protocol):
    def invoke(self, input: Any, config: Any | None = None, **kwargs: Any) -> Any: ...

    async def ainvoke(
        self, input: Any, config: Any | None = None, **kwargs: Any
    ) -> Any: ...

    def stream(
        self, input: Any, config: Any | None = None, **kwargs: Any
    ) -> Iterator[Any]: ...

    def astream(
        self, input: Any, config: Any | None = None, **kwargs: Any
    ) -> AsyncIterator[Any]: ...


class Provider(ABC):
    """Clase abstracta para implementar providers"""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Nombre del provider"""
        pass

    @staticmethod
    def _sse_encode(data: object) -> str:
        return msgspec.json.encode(data).decode()

    @abstractmethod
    def get_chat_model(
        self,
        model: str,
        temperature: float | None = None,
        top_p: float | None = None,
        max_tokens: int | None = None,
    ) -> BaseChatModel:
        """Devuelve el chat model de LangChain para los parámetros dados."""
        pass

    @abstractmethod
    def validate(
        self, payload: ChatCompletionsRequestPayload | ResponsesRequestPayload
    ) -> ValidateResponse:
        """
        Valida el payload de la petición (versión síncrona).

        Arguments:
            payload: Payload de la petición (ChatCompletions o Responses API)

        Returns:
            response (ValidateResponse): Resultado de la validación

        """
        pass

    async def avalidate(
        self, payload: ChatCompletionsRequestPayload | ResponsesRequestPayload
    ) -> ValidateResponse:
        """
        Valida el payload de la petición (versión asíncrona).
        Por defecto ejecuta validate() en un executor.

        Arguments:
            payload: Payload de la petición (ChatCompletions o Responses API)

        Returns:
            response (ValidateResponse): Resultado de la validación

        """
        return await asyncio.to_thread(self.validate, payload)

    @abstractmethod
    @overload
    def invoke(
        self,
        payload: ChatCompletionsRequestPayload,
    ) -> ChatCompletionResponse: ...

    @abstractmethod
    @overload
    def invoke(
        self,
        payload: ResponsesRequestPayload,
    ) -> ResponsesResponsePayload: ...

    @abstractmethod
    def invoke(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
    ) -> ChatCompletionResponse | ResponsesResponsePayload:
        """
        Invoca al modelo sin streaming y devuelve la respuesta en formato OpenAI (versión síncrona).
        """
        pass

    @abstractmethod
    @overload
    async def ainvoke(
        self,
        payload: ChatCompletionsRequestPayload,
    ) -> ChatCompletionResponse: ...

    @abstractmethod
    @overload
    async def ainvoke(
        self,
        payload: ResponsesRequestPayload,
    ) -> ResponsesResponsePayload: ...

    @abstractmethod
    async def ainvoke(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
    ) -> ChatCompletionResponse | ResponsesResponsePayload:
        """
        Invoca al modelo sin streaming y devuelve la respuesta en formato OpenAI (versión asíncrona).
        Por defecto ejecuta invoke() en un executor.
        """
        pass

    @abstractmethod
    @overload
    def stream(
        self,
        payload: ChatCompletionsRequestPayload,
    ) -> Generator[ChatCompletionStreamResponse, None, None]: ...

    @abstractmethod
    @overload
    def stream(
        self,
        payload: ResponsesRequestPayload,
    ) -> Generator[ResponsesStreamEvent, None, None]: ...

    @abstractmethod
    def stream(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
    ) -> Generator[ChatCompletionStreamResponse | ResponsesStreamEvent, None, None]:
        """
        Invoca al modelo **con** streaming y devuelve la respuesta en formato OpenAI (versión síncrona).
        """
        pass

    @overload
    def astream(
        self,
        payload: ChatCompletionsRequestPayload,
    ) -> AsyncGenerator[ChatCompletionStreamResponse, None]: ...

    @overload
    def astream(
        self,
        payload: ResponsesRequestPayload,
    ) -> AsyncGenerator[ResponsesStreamEvent, None]: ...

    def astream(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
    ) -> AsyncGenerator[ChatCompletionStreamResponse | ResponsesStreamEvent, None]:
        """
        Invoca al modelo **con** streaming y devuelve la respuesta en formato OpenAI (version asincrona).
        Por defecto ejecuta stream() y convierte el generador sincrono a asincrono.
        """

        async def _gen() -> AsyncGenerator[
            ChatCompletionStreamResponse | ResponsesStreamEvent, None
        ]:
            chunks = await asyncio.to_thread(lambda: list(self.stream(payload)))
            for chunk in chunks:
                yield chunk

        return _gen()

    @staticmethod
    def _build_agent_prompt() -> ChatPromptTemplate:
        return ChatPromptTemplate.from_messages(
            [
                ("system", "{system_prompt}"),
                MessagesPlaceholder("chat_history"),
                ("human", "{input}"),
                MessagesPlaceholder("agent_scratchpad"),
            ]
        )

    def _coerce_message_content(self, content: object) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, Sequence):
            text_parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(str(item.get("text", "")))
                elif isinstance(item, str):
                    text_parts.append(item)
            if text_parts:
                return "".join(text_parts)
        if isinstance(content, dict) and "content" in content:
            return self._coerce_message_content(content.get("content"))
        return str(content)

    def _to_agent_message(self, message: object) -> BaseMessage:
        role = getattr(message, "role", None)
        if role is None and isinstance(message, dict):
            role = message.get("role")
        content = getattr(message, "content", None)
        if content is None and isinstance(message, dict):
            content = message.get("content")
        content_text = self._coerce_message_content(content)

        if role == "assistant":
            return AIMessage(content=content_text)
        if role in {"system", "developer"}:
            return SystemMessage(content=content_text)
        return HumanMessage(content=content_text)

    def _build_agent_input(
        self, messages: Sequence[object]
    ) -> tuple[str, list[BaseMessage], str]:
        base_messages = [self._to_agent_message(msg) for msg in messages]
        system_prompts = [
            self._coerce_message_content(msg.content)
            for msg in base_messages
            if isinstance(msg, SystemMessage)
        ]
        system_prompt = "\n".join([part for part in system_prompts if part]).strip()
        non_system_messages = [
            msg for msg in base_messages if not isinstance(msg, SystemMessage)
        ]
        input_text = ""
        chat_history = non_system_messages
        for idx in range(len(non_system_messages) - 1, -1, -1):
            if isinstance(non_system_messages[idx], HumanMessage):
                input_text = self._coerce_message_content(
                    non_system_messages[idx].content
                )
                chat_history = (
                    non_system_messages[:idx] + non_system_messages[idx + 1 :]
                )
                break
        return system_prompt, chat_history, input_text

    @staticmethod
    def _extract_text_from_blocks(
        blocks: list[ContentBlock] | None,
    ) -> tuple[str, str | None]:
        """
        Extrae el contenido de texto y el posible razonamiento a partir de los `ContentBlocks` de la respuesta de `Langchain`.
        """
        if not blocks:
            return "", None

        text_parts: list[str] = []
        reasoning_parts: list[str] = []
        for block in blocks:
            block_type = block.get("type")
            if block_type in {"text", "text-plain"}:
                block = cast(TextContentBlock | PlainTextContentBlock, block)
                text_value = block.get("text")
                if text_value:
                    text_parts.append(str(text_value))
            elif block_type == "reasoning":
                block = cast(ReasoningContentBlock, block)
                reasoning_value = block.get("reasoning")
                if reasoning_value:
                    reasoning_parts.append(str(reasoning_value))

        text = "".join(text_parts)
        reasoning = "".join(reasoning_parts) if reasoning_parts else None
        return text, reasoning

    @staticmethod
    def _coerce_usage_value(value: object) -> int:
        if value is None:
            return 0
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            try:
                return int(float(value))
            except ValueError:
                return 0
        return 0

    @staticmethod
    def _normalize_usage_metadata(usage_meta: object) -> dict[str, Any]:
        if usage_meta is None:
            return {}
        if isinstance(usage_meta, Mapping):
            return {
                str(key): value
                for key, value in usage_meta.items()
            }
        if isinstance(usage_meta, SupportsModelDump):
            return {
                str(key): value
                for key, value in usage_meta.model_dump().items()
            }
        return {}

    def _extract_raw_usage_values(self, usage_meta: object) -> NormalizedUsage | None:
        usage = self._normalize_usage_metadata(usage_meta)
        if not usage:
            return None

        input_tokens = self._coerce_usage_value(
            usage.get("prompt_tokens")
            or usage.get("input_tokens")
            or usage.get("prompt_token_count")
            or usage.get("input_token_count")
        )
        output_tokens = self._coerce_usage_value(
            usage.get("completion_tokens")
            or usage.get("output_tokens")
            or usage.get("completion_token_count")
            or usage.get("generated_token_count")
        )
        total_tokens = self._coerce_usage_value(usage.get("total_tokens"))
        if not total_tokens and (input_tokens or output_tokens):
            total_tokens = input_tokens + output_tokens

        input_details_raw = (
            usage.get("prompt_tokens_details")
            or usage.get("prompt_token_details")
            or usage.get("input_token_details")
            or usage.get("input_tokens_details")
        )
        output_details_raw = (
            usage.get("completion_tokens_details")
            or usage.get("completion_token_details")
            or usage.get("output_token_details")
            or usage.get("output_tokens_details")
        )
        if not isinstance(input_details_raw, dict):
            input_details_raw = self._normalize_usage_metadata(input_details_raw)
        if not isinstance(output_details_raw, dict):
            output_details_raw = self._normalize_usage_metadata(output_details_raw)

        cached_tokens = self._coerce_usage_value(
            input_details_raw.get("cache_read")
            or input_details_raw.get("cached_tokens")
            or usage.get("cached_tokens")
        )
        input_audio = self._coerce_usage_value(
            input_details_raw.get("audio")
            or input_details_raw.get("audio_tokens")
            or usage.get("audio_tokens")
        )
        reasoning_tokens = self._coerce_usage_value(
            output_details_raw.get("reasoning")
            or output_details_raw.get("reasoning_tokens")
            or usage.get("reasoning_tokens")
        )
        output_audio = self._coerce_usage_value(
            output_details_raw.get("audio")
            or output_details_raw.get("audio_tokens")
            or usage.get("audio_tokens")
        )

        input_details = dict(input_details_raw)
        input_details.setdefault("audio", input_audio)
        input_details.setdefault("cache_read", cached_tokens)

        output_details = dict(output_details_raw)
        output_details.setdefault("audio", output_audio)
        output_details.setdefault("reasoning", reasoning_tokens)

        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens,
            "input_details": input_details,
            "output_details": output_details,
        }

    def _normalize_chat_completions_usage(
        self, usage_meta: object
    ) -> dict[str, Any] | None:
        raw = self._extract_raw_usage_values(usage_meta)
        if raw is None:
            return None
        return {
            "prompt_tokens": raw["input_tokens"],
            "prompt_tokens_details": raw["input_details"],
            "completion_tokens": raw["output_tokens"],
            "completion_tokens_details": raw["output_details"],
            "total_tokens": raw["total_tokens"],
        }

    def _normalize_responses_usage(self, usage_meta: object) -> dict[str, Any] | None:
        raw = self._extract_raw_usage_values(usage_meta)
        if raw is None:
            return None
        return {
            "input_tokens": raw["input_tokens"],
            "input_token_details": raw["input_details"],
            "output_tokens": raw["output_tokens"],
            "output_token_details": raw["output_details"],
            "total_tokens": raw["total_tokens"],
        }

    @staticmethod
    def _coerce_llm_response_to_ai_message(response: object) -> AIMessage:
        if isinstance(response, AIMessage):
            return response

        if isinstance(response, dict):
            raw_response = response.get("raw")
            if isinstance(raw_response, AIMessage):
                return raw_response
            return AIMessage(content=json.dumps(response))

        if isinstance(response, SupportsModelDumpJSON):
            return AIMessage(content=response.model_dump_json(exclude_none=True))

        return AIMessage(content=str(response))

    def _format_to_chat_completions(
        self,
        response: AIMessage,
        model: str,
    ) -> ChatCompletionResponse:
        """
        Formatea la respuesta de ``LangChain`` (``AIMessage``) al formato OpenAI Chat Completions.
        """
        content = response.text
        reasoning_content: str | None = None
        if response.content_blocks:
            text_from_blocks, reasoning_from_blocks = self._extract_text_from_blocks(
                response.content_blocks
            )
            if text_from_blocks:
                content = text_from_blocks

            reasoning_content = reasoning_from_blocks

        now = int(time.time())
        openai_response: ChatCompletionResponse = {
            "id": f"chatcmpl-{now}",
            "object": "chat.completion",
            "created": now,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": content,
                        "reasoning_content": reasoning_content,
                    },
                    "finish_reason": "stop",
                }
            ],
        }

        tool_calls = response.tool_calls
        if tool_calls:
            tool_calls_formatted: list[ChatCompletionMessageToolCall] = []
            for idx, tc in enumerate(tool_calls):
                tool_call: ChatCompletionMessageToolCallDict = {
                    "id": tc.get("id") or f"call_{int(time.time())}_{idx}",
                    "type": "function",
                    "function": {
                        "name": tc.get("name", ""),
                        "arguments": json.dumps(tc.get("args", {})),
                    },
                }
                tool_calls_formatted.append(tool_call)
            openai_response["choices"][0]["message"]["tool_calls"] = (
                tool_calls_formatted
            )
            openai_response["choices"][0]["finish_reason"] = "tool_calls"

        if response.additional_kwargs:
            if "finish_reason" in response.additional_kwargs:
                openai_response["choices"][0]["finish_reason"] = (
                    response.additional_kwargs["finish_reason"]
                )

            if "function_call" in response.additional_kwargs:
                openai_response["choices"][0]["message"]["function_call"] = (
                    response.additional_kwargs["function_call"]
                )

        if response.response_metadata:
            metadata = response.response_metadata

            if "system_fingerprint" in metadata:
                openai_response["system_fingerprint"] = metadata["system_fingerprint"]

            if "model_name" in metadata:
                openai_response["model"] = metadata["model_name"]

        usage_meta = response.usage_metadata
        if usage_meta:
            openai_response["usage"] = cast(
                CompletionUsage | None,
                self._normalize_chat_completions_usage(usage_meta),
            )
        return openai_response

    def _format_to_responses(
        self,
        response: AIMessage,
        model: str,
        payload: ResponsesRequestPayload,
    ) -> ResponsesResponsePayload:
        content = response.text
        if response.content_blocks:
            text_from_blocks, _ = self._extract_text_from_blocks(
                response.content_blocks
            )
            if text_from_blocks:
                content = text_from_blocks

        response_id = f"resp_{int(time.time())}"
        message_id = f"msg_{response_id}"
        message_item: dict[str, Any] = {
            "id": message_id,
            "type": "message",
            "role": "assistant",
            "content": [{"type": "output_text", "text": content, "annotations": []}],
            "status": "completed",
        }
        output = [message_item]

        tool_calls = response.tool_calls
        if tool_calls:
            for idx, tc in enumerate(tool_calls):
                args = tc.get("args")
                if isinstance(args, dict):
                    arguments = json.dumps(args) if args else ""
                elif args is None:
                    arguments = ""
                else:
                    arguments = str(args)
                call_id = tc.get("id", f"call_{int(time.time())}_{idx}")
                output.append(
                    {
                        "id": f"item_{call_id}",
                        "type": "function_call",
                        "call_id": call_id,
                        "name": tc.get("name", ""),
                        "arguments": arguments,
                        "status": "completed",
                    }
                )
        elif (
            response.additional_kwargs and "function_call" in response.additional_kwargs
        ):
            function_call = response.additional_kwargs["function_call"]
            if isinstance(function_call, dict):
                args = function_call.get("arguments")
                if isinstance(args, dict):
                    arguments = json.dumps(args) if args else ""
                elif args is None:
                    arguments = ""
                else:
                    arguments = str(args)
                call_id = f"call_{int(time.time())}"
                output.append(
                    {
                        "id": f"item_{call_id}",
                        "type": "function_call",
                        "call_id": call_id,
                        "name": function_call.get("name", ""),
                        "arguments": arguments,
                        "status": "completed",
                    }
                )

        if response.response_metadata:
            metadata = response.response_metadata
            if "model_name" in metadata:
                model = metadata["model_name"]

        usage = self._normalize_responses_usage(response.usage_metadata)
        response_object = {
            "id": response_id,
            "object": "response",
            "status": "completed",
            "created_at": int(time.time()),
            "model": model,
            "output": output,
            "parallel_tool_calls": payload.parallel_tool_calls,
            "metadata": payload.metadata,
            "tool_choice": payload.tool_choice,
            "temperature": payload.temperature,
            "top_p": payload.top_p,
            "instructions": payload.instructions,
            "usage": usage,
        }
        return cast(ResponsesResponsePayload, response_object)

    def _build_stream_response_object(
        self,
        response_id: str,
        created_at: int,
        model: str,
        payload: ResponsesRequestPayload,
        status: str,
        output: list[dict[str, Any]],
    ) -> ResponseObjectDict:
        response_object = {
            "id": response_id,
            "object": "response",
            "status": status,
            "created_at": created_at,
            "model": model,
            "output": output,
            "parallel_tool_calls": payload.parallel_tool_calls,
            "metadata": payload.metadata,
            "tool_choice": payload.tool_choice,
            "temperature": payload.temperature,
            "top_p": payload.top_p,
            "instructions": payload.instructions,
        }
        return cast(ResponseObjectDict, response_object)

    @staticmethod
    def _build_stream_output_items(
        message_id: str,
        accumulated_text: str,
        tool_call_states: Mapping[str, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = [
            {
                "id": message_id,
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": accumulated_text,
                        "annotations": [],
                    }
                ],
                "status": "completed",
            }
        ]
        sorted_tool_calls = sorted(
            tool_call_states.values(), key=lambda state: state["output_index"]
        )
        for state in sorted_tool_calls:
            output.append(
                {
                    "id": state["item_id"],
                    "type": "function_call",
                    "call_id": state["call_id"],
                    "name": state["name"],
                    "arguments": state["args"],
                    "status": "completed",
                }
            )
        return output

    @staticmethod
    def _format_responses_error_event(
        error: Exception, sequence_number: int | None = None
    ) -> ResponsesStreamEvent:
        return {
            "type": "error",
            "code": error.__class__.__name__,
            "message": str(error),
            "param": None,
            "sequence_number": sequence_number,
        }

    def _format_chunk_to_responses(
        self,
        chunk: AIMessageChunk | AIMessage,
        message_id: str,
        sequence_number: int,
        tool_call_states: dict[str, dict[str, Any]],
        next_output_index: int,
    ) -> tuple[list[ResponsesStreamEvent], int, int, str, str]:
        events: list[ResponsesStreamEvent] = []
        text_delta = chunk.text
        reasoning_delta = ""
        if chunk.content_blocks:
            text_from_blocks, reasoning_from_blocks = self._extract_text_from_blocks(
                chunk.content_blocks
            )
            if text_from_blocks:
                text_delta = text_from_blocks
            if reasoning_from_blocks:
                reasoning_delta = reasoning_from_blocks

        if text_delta:
            events.append({
                "type": "response.output_text.delta",
                "item_id": message_id,
                "output_index": 0,
                "content_index": 0,
                "delta": text_delta,
                "sequence_number": sequence_number,
            })
            sequence_number += 1

        if reasoning_delta:
            events.append({
                "type": "response.reasoning_text.delta",
                "item_id": message_id,
                "output_index": 0,
                "content_index": 0,
                "delta": reasoning_delta,
                "sequence_number": sequence_number,
            })
            sequence_number += 1

        # For streaming chunks prefer tool_call_chunks (native delta format);
        # for complete AIMessage responses fall back to tool_calls.
        tool_items = (
            chunk.tool_call_chunks
            if isinstance(chunk, AIMessageChunk)
            else chunk.tool_calls
        )
        for idx, tc in enumerate(tool_items):
            call_id = tc.get("id") or f"call_{int(time.time())}_{idx}"
            state = cast(ToolCallStreamState | None, tool_call_states.get(call_id))
            if not state:
                item_id = f"item_{call_id}"
                output_index = next_output_index
                next_output_index += 1
                state = cast(
                    ToolCallStreamState,
                    {
                        "item_id": item_id,
                        "output_index": output_index,
                        "call_id": call_id,
                        "name": str(tc.get("name") or ""),
                        "args": "",
                    },
                )
                tool_call_states[call_id] = dict(state)
                events.append({
                    "type": "response.output_item.added",
                    "output_index": output_index,
                    "item": {
                        "id": item_id,
                        "type": "function_call",
                        "call_id": call_id,
                        "name": state["name"],
                        "arguments": "",
                        "status": "in_progress",
                    },
                    "sequence_number": sequence_number,
                })
                sequence_number += 1

            if tc.get("name") and not state["name"]:
                state["name"] = str(tc["name"])

            args = tc.get("args")
            if isinstance(args, dict):
                args_delta = json.dumps(args) if args else ""
            elif args is None:
                args_delta = ""
            else:
                args_delta = str(args)
            if args_delta:
                state["args"] += args_delta
                tool_call_states[call_id] = dict(state)
                events.append(cast(ResponsesStreamEvent, {
                    "type": "response.function_call_arguments.delta",
                    "item_id": state["item_id"],
                    "output_index": state["output_index"],
                    "delta": args_delta,
                    "sequence_number": sequence_number,
                }))
                sequence_number += 1

        return events, sequence_number, next_output_index, text_delta, reasoning_delta

    def _format_chunk_to_chat_completions(
        self,
        chunk: AIMessageChunk | AIMessage,
        response_id: str,
        created_time: int,
        model: str,
    ) -> ChatCompletionStreamResponse:
        content = chunk.text
        reasoning_from_blocks: str | None = None
        if chunk.content_blocks:
            text_from_blocks, reasoning_from_blocks = self._extract_text_from_blocks(
                chunk.content_blocks
            )
            content = text_from_blocks

        delta: ChatCompletionStreamDeltaDict = {
            "content": content,
            "role": "assistant",
            "reasoning_content": reasoning_from_blocks,
        }

        # For streaming chunks prefer tool_call_chunks; for AIMessage use tool_calls.
        if isinstance(chunk, AIMessageChunk) and chunk.tool_call_chunks:
            tool_calls_formatted: list[ChatCompletionStreamToolCallDict] = []
            for tcc in chunk.tool_call_chunks:
                raw_index = tcc.get("index")
                tool_call_delta: ChatCompletionStreamToolCallDict = {
                    "index": raw_index if isinstance(raw_index, int) else 0,
                    "type": "function",
                }
                if "id" in tcc:
                    tool_call_delta["id"] = tcc["id"]
                if "name" in tcc or "args" in tcc:
                    function_delta: ChatCompletionStreamFunctionCallDict = {}
                    if "name" in tcc:
                        function_delta["name"] = tcc["name"]
                    if "args" in tcc:
                        function_delta["arguments"] = tcc["args"]
                    tool_call_delta["function"] = function_delta
                tool_calls_formatted.append(tool_call_delta)
            if tool_calls_formatted:
                delta["tool_calls"] = tool_calls_formatted
        elif chunk.tool_calls:
            tool_calls_formatted: list[ChatCompletionStreamToolCallDict] = []
            for idx, tc in enumerate(chunk.tool_calls):
                tool_call_delta: ChatCompletionStreamToolCallDict = {
                    "index": idx,
                    "type": "function",
                    "id": tc.get("id") or f"call_{int(time.time())}_{idx}",
                }
                function_delta: ChatCompletionStreamFunctionCallDict = {}
                if "name" in tc and tc["name"]:
                    function_delta["name"] = tc["name"]
                if "args" in tc:
                    args = tc["args"]
                    function_delta["arguments"] = (
                        json.dumps(args) if isinstance(args, dict) else str(args)
                    )
                if function_delta:
                    tool_call_delta["function"] = function_delta
                tool_calls_formatted.append(tool_call_delta)
            if tool_calls_formatted:
                delta["tool_calls"] = tool_calls_formatted

        has_delta_payload = bool(
            delta["content"]
            or delta.get("reasoning_content")
            or delta.get("tool_calls")
        )
        if not has_delta_payload:
            chunk_data: ChatCompletionStreamResponse = {
                "id": response_id,
                "object": "chat.completion.chunk",
                "created": created_time,
                "model": model,
                "choices": [],
            }
        else:
            chunk_data: ChatCompletionStreamResponse = {
                "id": response_id,
                "object": "chat.completion.chunk",
                "created": created_time,
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "delta": delta,
                        "finish_reason": None,
                    }
                ],
            }

        if chunk.response_metadata:
            metadata = chunk.response_metadata
            if metadata and isinstance(metadata, dict):
                if "system_fingerprint" in metadata:
                    chunk_data["system_fingerprint"] = metadata["system_fingerprint"]

        if chunk.usage_metadata:
            chunk_data["usage"] = cast(
                CompletionUsageDict | None,
                self._normalize_chat_completions_usage(chunk.usage_metadata),
            )

        return chunk_data
