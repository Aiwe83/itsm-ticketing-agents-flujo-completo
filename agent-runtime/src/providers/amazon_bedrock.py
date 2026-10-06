import os
import re
import time
from typing import Any, AsyncGenerator, Generator, cast, overload

import msgspec
from langchain_aws import ChatAnthropicBedrock
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from core.errors.base import ApplicationError
from core.logger import get_logger
from models.openai_compatible.chat_completions.input import (
    ChatCompletionsRequestPayload,
)
from models.openai_compatible.chat_completions.messages import (
    ChatCompletionRequestMessage,
)
from models.openai_compatible.chat_completions.output import (
    ChatCompletionResponse,
    ChatCompletionStreamResponse,
)
from models.openai_compatible.responses.input import (
    ResponsesRequestPayload,
    ResponsesTextFormatJsonSchema,
)
from models.openai_compatible.responses.messages import ResponseInput
from models.openai_compatible.responses.output import (
    ResponsesResponsePayload,
    ResponsesStreamEvent,
)

from .base import ModelRunnable, Provider, ValidateResponse
from .callback import LLMCallLogger

logger = get_logger()


class AmazonBedrockProvider(Provider):
    # TODO: Esto habría que sacarlo de BBDD en lugar de tenerlo hardcodeado.
    REASONING_MODELS: set[str] = {"eu.anthropic.claude-sonnet-4-6"}
    AVAILABLE_MODELS: set[str] = {"eu.anthropic.claude-sonnet-4-6"}
    AUDIO_MODELS: set[str] = set()

    @property
    def provider_name(self) -> str:
        return "AmazonBedrock"

    # ------------------------------------------------------------------ #
    #  Public interface                                                    #
    # ------------------------------------------------------------------ #

    def get_chat_model(
        self,
        model: str,
        temperature: float | None = None,
        top_p: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatAnthropicBedrock:
        """Devuelve un ChatAnthropicBedrock listo para uso externo (agentes, cadenas)."""
        params: dict[str, Any] = {
            "model": model,
            "region_name": self._default_region(),
            "callbacks": [LLMCallLogger("Amazon Bedrock")],
            "metadata": {"provider": self.provider_name, "model": model},
        }
        if temperature is not None:
            params["temperature"] = temperature
        if top_p is not None:
            params["top_p"] = top_p
        if max_tokens is not None:
            params["max_tokens"] = max_tokens
        return ChatAnthropicBedrock(**params)

    def validate(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
    ) -> ValidateResponse:
        """Valida el payload según las restricciones de Amazon Bedrock / Anthropic."""
        model_name = payload.model
        if model_name not in self.AVAILABLE_MODELS:
            return ValidateResponse(
                is_valid=False,
                error_message=(
                    f"El modelo {model_name} no está disponible para el provider "
                    f"{self.provider_name}. "
                    f"Modelos disponibles: {', '.join(self.AVAILABLE_MODELS)}"
                ),
            )
        if isinstance(payload, ChatCompletionsRequestPayload):
            return self.__validate_chat_completions(payload, model_name)
        return self.__validate_responses(payload, model_name)

    async def avalidate(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
    ) -> ValidateResponse:
        return self.validate(payload)

    @overload
    def invoke(
        self, payload: ChatCompletionsRequestPayload
    ) -> ChatCompletionResponse: ...

    @overload
    def invoke(self, payload: ResponsesRequestPayload) -> ResponsesResponsePayload: ...

    def invoke(
        self, payload: ChatCompletionsRequestPayload | ResponsesRequestPayload
    ) -> ChatCompletionResponse | ResponsesResponsePayload:
        """Invoca al modelo sin streaming y devuelve la respuesta en formato OpenAI."""
        validation_result = self.validate(payload)
        if validation_result.get("is_valid") is not True:
            raise ApplicationError(
                validation_result.get("error_message") or "",
                status_code=400,
                error_name="ValidationError",
            )
        llm = self._build_llm(payload)
        if isinstance(payload, ChatCompletionsRequestPayload):
            messages = self._serialize_chat_completions_messages(payload.messages)
            response = llm.invoke(messages)
            return self._format_to_chat_completions(
                self._coerce_llm_response_to_ai_message(response),
                payload.model,
            )
        messages = self._serialize_responses_messages(payload.input)
        response = llm.invoke(messages)
        return self._format_to_responses(
            self._coerce_llm_response_to_ai_message(response),
            payload.model,
            payload,
        )

    @overload
    async def ainvoke(
        self, payload: ChatCompletionsRequestPayload
    ) -> ChatCompletionResponse: ...

    @overload
    async def ainvoke(
        self, payload: ResponsesRequestPayload
    ) -> ResponsesResponsePayload: ...

    async def ainvoke(
        self, payload: ChatCompletionsRequestPayload | ResponsesRequestPayload
    ) -> ChatCompletionResponse | ResponsesResponsePayload:
        """Invoca al modelo sin streaming de forma asíncrona."""
        validation_result = await self.avalidate(payload)
        if validation_result.get("is_valid") is not True:
            raise ApplicationError(
                validation_result.get("error_message") or "",
                status_code=400,
                error_name="ValidationError",
            )
        llm = self._build_llm(payload)
        if isinstance(payload, ChatCompletionsRequestPayload):
            messages = self._serialize_chat_completions_messages(payload.messages)
            response = await llm.ainvoke(messages)
            return self._format_to_chat_completions(
                self._coerce_llm_response_to_ai_message(response),
                payload.model,
            )
        messages = self._serialize_responses_messages(payload.input)
        response = await llm.ainvoke(messages)
        return self._format_to_responses(
            self._coerce_llm_response_to_ai_message(response),
            payload.model,
            payload,
        )

    @overload
    def stream(
        self, payload: ChatCompletionsRequestPayload
    ) -> Generator[ChatCompletionStreamResponse, None, None]: ...

    @overload
    def stream(
        self, payload: ResponsesRequestPayload
    ) -> Generator[ResponsesStreamEvent, None, None]: ...

    def stream(
        self, payload: ChatCompletionsRequestPayload | ResponsesRequestPayload
    ) -> Generator[ChatCompletionStreamResponse | ResponsesStreamEvent, None, None]:
        """Invoca al modelo con streaming y devuelve la respuesta en formato OpenAI."""
        validation_result = self.validate(payload)
        if validation_result.get("is_valid") is not True:
            raise ApplicationError(
                validation_result.get("error_message") or "",
                status_code=400,
                error_name="ValidationError",
            )
        if isinstance(payload, ResponsesRequestPayload):
            yield from self._stream_responses(payload)
            return

        llm = self._build_llm(payload, streaming=True)
        messages = self._serialize_chat_completions_messages(payload.messages)
        response_id = f"chatcmpl-{int(time.time())}"
        created_time = int(time.time())
        try:
            for chunk in llm.stream(messages):
                chunk_data = self._format_chunk_to_chat_completions(
                    chunk, response_id, created_time, payload.model
                )
                if chunk_data:
                    yield chunk_data
        except Exception as exc:
            yield self._format_responses_error_event(exc)

    @overload
    def astream(
        self, payload: ChatCompletionsRequestPayload
    ) -> AsyncGenerator[ChatCompletionStreamResponse, None]: ...

    @overload
    def astream(
        self, payload: ResponsesRequestPayload
    ) -> AsyncGenerator[ResponsesStreamEvent, None]: ...

    def astream(
        self, payload: ChatCompletionsRequestPayload | ResponsesRequestPayload
    ) -> AsyncGenerator[ChatCompletionStreamResponse | ResponsesStreamEvent, None]:
        """Invoca al modelo con streaming de forma asíncrona."""

        async def _gen() -> AsyncGenerator[
            ChatCompletionStreamResponse | ResponsesStreamEvent, None
        ]:
            validation_result = await self.avalidate(payload)
            if validation_result.get("is_valid") is not True:
                raise ApplicationError(
                    validation_result.get("error_message") or "",
                    status_code=400,
                    error_name="ValidationError",
                )
            if isinstance(payload, ResponsesRequestPayload):
                async for chunk in self._astream_responses(payload):
                    yield chunk
                return

            llm = self._build_llm(payload, streaming=True)
            messages = self._serialize_chat_completions_messages(payload.messages)
            response_id = f"chatcmpl-{int(time.time())}"
            created_time = int(time.time())
            try:
                async for chunk in llm.astream(messages):
                    chunk_data = self._format_chunk_to_chat_completions(
                        chunk, response_id, created_time, payload.model
                    )
                    if chunk_data:
                        yield chunk_data
            except Exception as exc:
                yield self._format_responses_error_event(exc)

        return _gen()

    # ------------------------------------------------------------------ #
    #  Validation                                                          #
    # ------------------------------------------------------------------ #

    def __validate_chat_completions(
        self,
        payload: ChatCompletionsRequestPayload,
        model_name: str,
    ) -> ValidateResponse:
        """Validaciones específicas para Chat Completions API."""
        # Web search no disponible en Bedrock
        if payload.tools is not None:
            for tool in payload.tools:
                if tool.type == "web_search":
                    return ValidateResponse(
                        is_valid=False,
                        error_message="Amazon Bedrock no soporta web search de forma nativa.",
                    )

        if payload.prediction is not None:
            logger.warning(
                "El parámetro 'prediction' no está soportado en Amazon Bedrock."
            )

        if (
            self._extract_structured_output_schema(payload)
            and self._resolve_bedrock_tool_binding(payload)[0]
        ):
            return ValidateResponse(
                is_valid=False,
                error_message=(
                    "Amazon Bedrock no soporta combinar herramientas con "
                    "'response_format.type=json_schema'."
                ),
            )

        if self._is_reasoning_model(model_name):
            unsupported: list[str] = []
            for attr in (
                "temperature",
                "top_p",
                "presence_penalty",
                "frequency_penalty",
                "logprobs",
                "top_logprobs",
                "logit_bias",
            ):
                if getattr(payload, attr, None) is not None:
                    unsupported.append(attr)
                    object.__setattr__(payload, attr, None)

            if unsupported:
                logger.warning(
                    "Los parámetros [{}] no están soportados en modelos de razonamiento ({}).",
                    ", ".join(unsupported),
                    model_name,
                )

            if payload.parallel_tool_calls is True:
                logger.warning(
                    "parallel_tool_calls no está soportado en modelos de razonamiento de Bedrock."
                )
                object.__setattr__(payload, "parallel_tool_calls", False)

        else:
            # Parámetros no soportados por Anthropic en Bedrock (modelos no-razonamiento)
            if payload.logprobs is not None:
                logger.warning(
                    "El parámetro 'logprobs' no está soportado en Amazon Bedrock."
                )
            if payload.logit_bias is not None:
                logger.warning(
                    "El parámetro 'logit_bias' no está soportado en Amazon Bedrock."
                )
            if payload.presence_penalty is not None:
                logger.warning(
                    "El parámetro 'presence_penalty' no está soportado en Amazon Bedrock."
                )
            if payload.frequency_penalty is not None:
                logger.warning(
                    "El parámetro 'frequency_penalty' no está soportado en Amazon Bedrock."
                )

        if payload.modalities is not None and "audio" in payload.modalities:
            return ValidateResponse(
                is_valid=False,
                error_message="Amazon Bedrock no soporta modalidad de audio.",
            )

        if payload.audio is not None:
            return ValidateResponse(
                is_valid=False,
                error_message="Amazon Bedrock no soporta parámetros de audio.",
            )

        if payload.top_logprobs is not None and not payload.logprobs:
            return ValidateResponse(
                is_valid=False,
                error_message="El parámetro 'top_logprobs' requiere que 'logprobs' sea true.",
            )

        return ValidateResponse(is_valid=True, error_message=None)

    def __validate_responses(
        self,
        payload: ResponsesRequestPayload,
        model_name: str,
    ) -> ValidateResponse:
        """Validaciones específicas para Responses API."""
        if payload.tools is not None:
            for tool in payload.tools:
                if tool.type == "web_search":
                    return ValidateResponse(
                        is_valid=False,
                        error_message="Amazon Bedrock no soporta web search de forma nativa en Responses API.",
                    )

        if (
            self._extract_structured_output_schema_from_responses(payload)
            and self._resolve_bedrock_tool_binding(payload)[0]
        ):
            return ValidateResponse(
                is_valid=False,
                error_message=(
                    "Amazon Bedrock no soporta combinar herramientas con "
                    "'text.format.type=json_schema'."
                ),
            )

        if self._is_reasoning_model(model_name):
            unsupported: list[str] = []
            for attr in ("temperature", "top_p"):
                if getattr(payload, attr, None) is not None:
                    unsupported.append(attr)
                    object.__setattr__(payload, attr, None)

            if unsupported:
                logger.warning(
                    "Los parámetros [{}] no están soportados en modelos de razonamiento ({}).",
                    ", ".join(unsupported),
                    model_name,
                )

            if payload.parallel_tool_calls is True:
                logger.warning(
                    "parallel_tool_calls no está soportado en modelos de razonamiento de Bedrock."
                )
                object.__setattr__(payload, "parallel_tool_calls", False)

        else:
            if payload.reasoning is not None:
                logger.warning(
                    "El parámetro 'reasoning' solo está disponible para modelos de razonamiento. "
                    "El modelo '{}' no es un modelo de razonamiento.",
                    model_name,
                )
                object.__setattr__(payload, "reasoning", None)

        return ValidateResponse(is_valid=True, error_message=None)

    # ------------------------------------------------------------------ #
    #  LLM construction                                                    #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _default_region() -> str:
        return (
            os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "eu-central-1"
        )

    def _build_llm(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
        *,
        streaming: bool = False,
    ) -> ModelRunnable:
        """Construye un ChatAnthropicBedrock completamente configurado a partir del payload."""
        params: dict[str, Any] = {
            "model": payload.model,
            "region_name": self._default_region(),
            "callbacks": [LLMCallLogger("Amazon Bedrock")],
            "metadata": {
                "provider": self.provider_name,
                "model": payload.model,
                "streaming": streaming,
                "api": "responses"
                if isinstance(payload, ResponsesRequestPayload)
                else "chat_completions",
            },
        }

        if payload.temperature is not None:
            params["temperature"] = payload.temperature
        if payload.top_p is not None:
            params["top_p"] = payload.top_p

        max_tokens = (
            payload.max_completion_tokens
            if isinstance(payload, ChatCompletionsRequestPayload)
            else payload.max_output_tokens
        )
        if max_tokens is not None:
            params["max_tokens"] = max_tokens

        # Extended thinking para Claude 3.7+ en Bedrock
        if self._is_reasoning_model(payload.model):
            effort = (
                payload.reasoning_effort
                if isinstance(payload, ChatCompletionsRequestPayload)
                else (payload.reasoning.effort if payload.reasoning else None)
            )
            thinking = self._build_thinking_config(effort=effort, max_tokens=max_tokens)
            if thinking:
                params["model_kwargs"] = thinking

        # stop sequences (solo Chat Completions)
        if (
            isinstance(payload, ChatCompletionsRequestPayload)
            and payload.stop is not None
        ):
            params["stop_sequences"] = (
                payload.stop if isinstance(payload.stop, list) else [payload.stop]
            )

        chat_model = ChatAnthropicBedrock(**params)

        # Structured output (solo en modo no-streaming)
        if not streaming:
            schema = (
                self._extract_structured_output_schema(payload)
                if isinstance(payload, ChatCompletionsRequestPayload)
                else self._extract_structured_output_schema_from_responses(payload)
            )
            if schema:
                return chat_model.with_structured_output(
                    schema,
                    include_raw=True,
                    method="json_schema",
                )

        llm: ModelRunnable = chat_model

        tools, tool_choice = self._resolve_bedrock_tool_binding(payload)
        if tools:
            bind_kwargs: dict[str, Any] = {}
            if tool_choice is not None:
                bind_kwargs["tool_choice"] = tool_choice
            if payload.parallel_tool_calls is not None:
                bind_kwargs["parallel_tool_calls"] = payload.parallel_tool_calls
            llm = chat_model.bind_tools(tools, **bind_kwargs)

        return llm

    # ------------------------------------------------------------------ #
    #  Serialisation helpers                                               #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _strip_nones(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {
                k: AmazonBedrockProvider._strip_nones(v)
                for k, v in obj.items()
                if v is not None
            }
        if isinstance(obj, list):
            return [AmazonBedrockProvider._strip_nones(i) for i in obj]
        return obj

    @classmethod
    def _struct_to_dict(cls, obj: Any) -> Any:
        """Convierte un msgspec.Struct (o cualquier objeto) a dict sin Nones."""
        if isinstance(obj, msgspec.Struct):
            return cls._strip_nones(msgspec.to_builtins(obj))
        if hasattr(obj, "model_dump"):
            return obj.model_dump(exclude_none=True)
        return obj

    @classmethod
    def _extract_tool_name(cls, tool_payload: Any) -> str | None:
        tool_dict = cls._struct_to_dict(tool_payload)
        if not isinstance(tool_dict, dict):
            return None

        if tool_dict.get("type") == "function":
            function_payload = tool_dict.get("function") or {}
            if isinstance(function_payload, dict):
                return cast(str | None, function_payload.get("name"))

        if tool_dict.get("type") == "custom":
            custom_payload = tool_dict.get("custom") or {}
            if isinstance(custom_payload, dict):
                return cast(str | None, custom_payload.get("name"))

        return cast(str | None, tool_dict.get("name"))

    def _normalize_bedrock_tool_choice(
        self,
        tool_choice: Any,
    ) -> str | dict[str, Any] | None:
        if tool_choice is None:
            return None

        normalized = self._struct_to_dict(tool_choice)
        if normalized == "none":
            return None
        if normalized == "required":
            return "any"
        if isinstance(normalized, str):
            return normalized

        if not isinstance(normalized, dict):
            return None

        choice_type = normalized.get("type")
        if choice_type == "function":
            function_payload = normalized.get("function") or {}
            if isinstance(function_payload, dict):
                return cast(str | None, function_payload.get("name"))
        if choice_type == "custom":
            custom_payload = normalized.get("custom") or {}
            if isinstance(custom_payload, dict):
                return cast(str | None, custom_payload.get("name"))
        if choice_type == "tool" and normalized.get("name"):
            return normalized

        return normalized

    def _resolve_bedrock_tool_binding(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
    ) -> tuple[list[Any], str | dict[str, Any] | None]:
        if not payload.tools:
            return [], None

        raw_tools = [self._struct_to_dict(tool) for tool in payload.tools]
        normalized_choice = self._normalize_bedrock_tool_choice(payload.tool_choice)

        if isinstance(payload, ChatCompletionsRequestPayload):
            choice_payload = (
                self._struct_to_dict(payload.tool_choice)
                if isinstance(payload.tool_choice, msgspec.Struct)
                else payload.tool_choice
            )
            if choice_payload == "none":
                return [], None

            if (
                isinstance(choice_payload, dict)
                and choice_payload.get("type") == "allowed_tools"
            ):
                allowed_tools = choice_payload.get("allowed_tools") or {}
                allowed_names = {
                    tool_name
                    for tool_name in (
                        self._extract_tool_name(tool)
                        for tool in allowed_tools.get("tools", [])
                    )
                    if tool_name
                }
                raw_tools = [
                    tool
                    for tool in raw_tools
                    if self._extract_tool_name(tool) in allowed_names
                ]
                mode = allowed_tools.get("mode")
                normalized_choice = "any" if mode == "required" else "auto"

        return raw_tools, normalized_choice

    @staticmethod
    def _parse_data_url(url: str) -> tuple[str, str] | None:
        match = re.match(r"^data:(?P<media>[^;]+);base64,(?P<data>.+)$", url)
        if not match:
            return None
        return match.group("media"), match.group("data")

    def _bedrock_image_block_from_url(self, url: str | None) -> dict[str, Any] | None:
        if not url:
            return None
        parsed = self._parse_data_url(url)
        if not parsed:
            return None
        media_type, data = parsed
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": data},
        }

    def _chat_content_to_bedrock_blocks(
        self, content: Any
    ) -> list[str | dict[str, Any]]:
        """Normaliza content de Chat Completions a bloques Anthropic."""
        if content is None:
            return []
        if isinstance(content, str):
            return [{"type": "text", "text": content}]

        blocks: list[str | dict[str, Any]] = []
        for part in content:
            part_dict = (
                self._struct_to_dict(part)
                if isinstance(part, msgspec.Struct)
                else (
                    part.model_dump(exclude_none=True)
                    if hasattr(part, "model_dump")
                    else cast(dict[str, Any], part)
                )
            )
            part_type = part_dict.get("type")

            if part_type == "text":
                blocks.append({"type": "text", "text": part_dict.get("text", "")})
            elif part_type == "image_url":
                image_payload = part_dict.get("image_url") or {}
                url = (
                    image_payload.get("url")
                    if isinstance(image_payload, dict)
                    else None
                )
                image_block = self._bedrock_image_block_from_url(url)
                if image_block:
                    blocks.append(image_block)
            elif part_type == "input_audio":
                blocks.append({"type": "text", "text": "[audio input omitted]"})
            elif part_type == "file":
                file_payload = part_dict.get("file") or {}
                file_label = (
                    file_payload.get("filename")
                    or file_payload.get("file_id")
                    or file_payload.get("file_url")
                )
                blocks.append(
                    {"type": "text", "text": f"[file:{file_label or 'input'}]"}
                )
            elif part_type == "refusal":
                blocks.append({"type": "text", "text": part_dict.get("refusal", "")})
            else:
                blocks.append(part_dict)

        return blocks

    def _responses_content_to_bedrock_blocks(
        self, content: Any
    ) -> list[str | dict[str, Any]]:
        """Normaliza content de Responses API a bloques Anthropic."""
        if isinstance(content, str):
            return [{"type": "text", "text": content}]

        blocks: list[str | dict[str, Any]] = []
        for item in content:
            item_dict = (
                self._struct_to_dict(item)
                if isinstance(item, msgspec.Struct)
                else (
                    item.model_dump(exclude_none=True)
                    if hasattr(item, "model_dump")
                    else cast(dict[str, Any], item)
                )
            )
            item_type = item_dict.get("type")

            if item_type == "input_text":
                blocks.append({"type": "text", "text": item_dict.get("text", "")})
            elif item_type == "input_image":
                image_block = self._bedrock_image_block_from_url(
                    item_dict.get("image_url")
                )
                if image_block:
                    blocks.append(image_block)
            elif item_type == "input_file":
                file_label = (
                    item_dict.get("filename")
                    or item_dict.get("file_id")
                    or item_dict.get("file_url")
                )
                blocks.append(
                    {"type": "text", "text": f"[file:{file_label or 'input'}]"}
                )
            else:
                blocks.append({"type": "text", "text": str(item_dict)})

        return blocks

    @staticmethod
    def _convert_tool_calls(tool_calls: Any) -> list[dict[str, Any]]:
        if not tool_calls:
            return []
        converted: list[dict[str, Any]] = []
        for tc in tool_calls:
            tc_dict = (
                AmazonBedrockProvider._strip_nones(msgspec.to_builtins(tc))
                if isinstance(tc, msgspec.Struct)
                else (
                    tc.model_dump(exclude_none=True)
                    if hasattr(tc, "model_dump")
                    else cast(dict[str, Any], tc)
                )
            )
            tc_type = tc_dict.get("type")
            if tc_type == "function" and "function" in tc_dict:
                func = tc_dict["function"] or {}
                converted.append(
                    {
                        "id": tc_dict.get("id"),
                        "name": func.get("name", ""),
                        "args": func.get("arguments"),
                    }
                )
            elif tc_type == "custom" and "custom" in tc_dict:
                custom = tc_dict["custom"] or {}
                converted.append(
                    {
                        "id": tc_dict.get("id"),
                        "name": custom.get("name", ""),
                        "args": custom.get("input"),
                    }
                )
        return converted

    def _coerce_chat_completions_messages(
        self, messages: list[ChatCompletionRequestMessage]
    ) -> list[AIMessage | HumanMessage | SystemMessage | ToolMessage]:
        coerced: list[AIMessage | HumanMessage | SystemMessage | ToolMessage] = []
        for message in messages:
            message_dict = (
                self._struct_to_dict(message)
                if isinstance(message, msgspec.Struct)
                else (
                    message.model_dump(exclude_none=True)
                    if hasattr(message, "model_dump")
                    else cast(dict[str, Any], message)
                )
            )
            role = message_dict.get("role")
            content_blocks = self._chat_content_to_bedrock_blocks(
                message_dict.get("content")
            )
            tool_calls = self._convert_tool_calls(message_dict.get("tool_calls"))
            if not tool_calls and message_dict.get("function_call"):
                func = message_dict["function_call"]
                tool_calls = [
                    {
                        "id": func.get("id"),
                        "name": func.get("name", ""),
                        "args": func.get("arguments"),
                    }
                ]

            if role == "user":
                coerced.append(HumanMessage(content=content_blocks))
            elif role in {"system", "developer"}:
                coerced.append(SystemMessage(content=content_blocks))
            elif role == "assistant":
                coerced.append(
                    AIMessage(
                        content=content_blocks if content_blocks else "",
                        tool_calls=tool_calls or [],
                        additional_kwargs={
                            "function_call": message_dict.get("function_call")
                        }
                        if message_dict.get("function_call")
                        else {},
                    )
                )
            elif role == "tool":
                coerced.append(
                    ToolMessage(
                        content=content_blocks if content_blocks else "",
                        tool_call_id=message_dict.get("tool_call_id")
                        or message_dict.get("id")
                        or "",
                    )
                )
            else:
                coerced.append(HumanMessage(content=content_blocks))
        return coerced

    def _coerce_responses_input(
        self, input_data: ResponseInput
    ) -> list[AIMessage | HumanMessage | SystemMessage]:
        if isinstance(input_data, str):
            return [HumanMessage(content=[{"type": "text", "text": input_data}])]
        if isinstance(input_data, list):
            messages: list[AIMessage | HumanMessage | SystemMessage] = []
            for item in input_data:
                item_dict = (
                    self._struct_to_dict(item)
                    if isinstance(item, msgspec.Struct)
                    else (
                        item.model_dump(exclude_none=True)
                        if hasattr(item, "model_dump")
                        else cast(dict[str, Any], item)
                    )
                )
                role = item_dict.get("role")
                content_blocks = self._responses_content_to_bedrock_blocks(
                    item_dict.get("content")
                )
                if role == "user":
                    messages.append(HumanMessage(content=content_blocks))
                elif role == "assistant":
                    messages.append(AIMessage(content=content_blocks))
                elif role in {"system", "developer"}:
                    messages.append(SystemMessage(content=content_blocks))
                else:
                    raise ValueError(
                        "Unsupported Responses input item; expected role message."
                    )
            if not messages:
                raise ValueError("Responses input list produced no messages.")
            return messages
        raise ValueError("Unsupported Responses input type.")

    def _serialize_chat_completions_messages(
        self, messages: list[ChatCompletionRequestMessage]
    ) -> list[AIMessage | HumanMessage | SystemMessage | ToolMessage]:
        return self._coerce_chat_completions_messages(messages)

    def _serialize_responses_messages(
        self, input: ResponseInput
    ) -> list[AIMessage | HumanMessage | SystemMessage]:
        return self._coerce_responses_input(input)

    # ------------------------------------------------------------------ #
    #  Structured output / thinking helpers                                #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _extract_structured_output_schema(
        payload: ChatCompletionsRequestPayload,
    ) -> dict[str, Any] | None:
        response_format = payload.response_format
        if response_format is None or not isinstance(
            response_format, ResponsesTextFormatJsonSchema
        ):
            return None
        schema_wrapper = response_format.json_schema
        schema = schema_wrapper.get("schema", schema_wrapper)
        name = schema_wrapper.get("name")
        if name and "title" not in schema:
            schema = {**schema, "title": name}
        return schema

    @staticmethod
    def _extract_structured_output_schema_from_responses(
        payload: ResponsesRequestPayload,
    ) -> dict[str, Any] | None:
        text_config = payload.text
        if text_config is None or text_config.format is None:
            return None
        format_obj = text_config.format
        if not isinstance(format_obj, ResponsesTextFormatJsonSchema):
            return None
        schema_wrapper = format_obj.json_schema
        schema = schema_wrapper.get("schema", schema_wrapper)
        name = schema_wrapper.get("name")
        if name and "title" not in schema:
            schema = {**schema, "title": name}
        return schema

    @staticmethod
    def _build_thinking_config(
        effort: str | None,
        max_tokens: int | None,
    ) -> dict[str, Any] | None:
        """Construye el bloque de extended thinking para Claude 3.7+ en Bedrock."""
        if not effort or effort == "none":
            return None
        budget_by_effort: dict[str, int] = {
            "minimal": 256,
            "low": 512,
            "medium": 1024,
            "high": 2048,
            "xhigh": 4096,
        }
        budget = budget_by_effort.get(effort, 1024)
        if max_tokens:
            budget = min(budget, max_tokens)
        return {"thinking": {"type": "enabled", "budget_tokens": budget}}

    def _is_reasoning_model(self, model_name: str) -> bool:
        """Verifica si el modelo es un modelo de razonamiento (extended thinking)."""
        return model_name in self.REASONING_MODELS

    # ------------------------------------------------------------------ #
    #  Streaming – Responses API                                           #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _validate_responses_event(event: dict[str, Any]) -> ResponsesStreamEvent:
        return cast(ResponsesStreamEvent, event)

    def _stream_responses(
        self, payload: ResponsesRequestPayload
    ) -> Generator[ResponsesStreamEvent, None, None]:
        llm = self._build_llm(payload, streaming=True)
        messages = self._serialize_responses_messages(payload.input)
        response_id = f"resp_{int(time.time())}"
        message_id = f"msg_{response_id}"
        sequence_number = 0
        created_at = int(time.time())
        accumulated_text = ""
        accumulated_reasoning = ""
        tool_call_states: dict[str, dict[str, Any]] = {}
        next_output_index = 1

        yield self._validate_responses_event(
            {
                "type": "response.created",
                "response": self._build_stream_response_object(
                    response_id, created_at, payload.model, payload, "in_progress", []
                ),
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        yield self._validate_responses_event(
            {
                "type": "response.in_progress",
                "response": self._build_stream_response_object(
                    response_id, created_at, payload.model, payload, "in_progress", []
                ),
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        yield self._validate_responses_event(
            {
                "type": "response.output_item.added",
                "output_index": 0,
                "item": {
                    "id": message_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "", "annotations": []}],
                    "status": "in_progress",
                },
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        try:
            for chunk in llm.stream(messages):
                (
                    events,
                    sequence_number,
                    next_output_index,
                    text_delta,
                    reasoning_delta,
                ) = self._format_chunk_to_responses(
                    chunk,
                    message_id,
                    sequence_number,
                    tool_call_states,
                    next_output_index,
                )
                if text_delta:
                    accumulated_text += text_delta
                if reasoning_delta:
                    accumulated_reasoning += reasoning_delta
                for event in events:
                    yield event
        except Exception as exc:
            yield self._format_responses_error_event(exc, sequence_number)
            return

        yield self._validate_responses_event(
            {
                "type": "response.output_text.done",
                "item_id": message_id,
                "output_index": 0,
                "content_index": 0,
                "text": accumulated_text,
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        if accumulated_reasoning:
            yield self._validate_responses_event(
                {
                    "type": "response.reasoning_text.done",
                    "item_id": message_id,
                    "output_index": 0,
                    "content_index": 0,
                    "text": accumulated_reasoning,
                    "sequence_number": sequence_number,
                }
            )
            sequence_number += 1

        yield self._validate_responses_event(
            {
                "type": "response.output_item.done",
                "output_index": 0,
                "item": {
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
                },
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        for state in tool_call_states.values():
            yield self._validate_responses_event(
                {
                    "type": "response.function_call_arguments.done",
                    "item_id": state["item_id"],
                    "output_index": state["output_index"],
                    "arguments": state["args"],
                    "sequence_number": sequence_number,
                }
            )
            sequence_number += 1
            yield self._validate_responses_event(
                {
                    "type": "response.output_item.done",
                    "output_index": state["output_index"],
                    "item": {
                        "id": state["item_id"],
                        "type": "function_call",
                        "call_id": state["call_id"],
                        "name": state["name"],
                        "arguments": state["args"],
                        "status": "completed",
                    },
                    "sequence_number": sequence_number,
                }
            )
            sequence_number += 1

        yield self._validate_responses_event(
            {
                "type": "response.completed",
                "response": self._build_stream_response_object(
                    response_id,
                    created_at,
                    payload.model,
                    payload,
                    "completed",
                    self._build_stream_output_items(
                        message_id, accumulated_text, tool_call_states
                    ),
                ),
                "sequence_number": sequence_number,
            }
        )

    async def _astream_responses(
        self, payload: ResponsesRequestPayload
    ) -> AsyncGenerator[ResponsesStreamEvent, None]:
        llm = self._build_llm(payload, streaming=True)
        messages = self._serialize_responses_messages(payload.input)
        response_id = f"resp_{int(time.time())}"
        message_id = f"msg_{response_id}"
        sequence_number = 0
        created_at = int(time.time())
        accumulated_text = ""
        accumulated_reasoning = ""
        tool_call_states: dict[str, dict[str, Any]] = {}
        next_output_index = 1

        yield self._validate_responses_event(
            {
                "type": "response.created",
                "response": self._build_stream_response_object(
                    response_id, created_at, payload.model, payload, "in_progress", []
                ),
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        yield self._validate_responses_event(
            {
                "type": "response.in_progress",
                "response": self._build_stream_response_object(
                    response_id, created_at, payload.model, payload, "in_progress", []
                ),
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        yield self._validate_responses_event(
            {
                "type": "response.output_item.added",
                "output_index": 0,
                "item": {
                    "id": message_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "", "annotations": []}],
                    "status": "in_progress",
                },
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        try:
            async for chunk in llm.astream(messages):
                (
                    events,
                    sequence_number,
                    next_output_index,
                    text_delta,
                    reasoning_delta,
                ) = self._format_chunk_to_responses(
                    chunk,
                    message_id,
                    sequence_number,
                    tool_call_states,
                    next_output_index,
                )
                if text_delta:
                    accumulated_text += text_delta
                if reasoning_delta:
                    accumulated_reasoning += reasoning_delta
                for event in events:
                    yield event
        except Exception as exc:
            yield self._format_responses_error_event(exc, sequence_number)
            return

        yield self._validate_responses_event(
            {
                "type": "response.output_text.done",
                "item_id": message_id,
                "output_index": 0,
                "content_index": 0,
                "text": accumulated_text,
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        if accumulated_reasoning:
            yield self._validate_responses_event(
                {
                    "type": "response.reasoning_text.done",
                    "item_id": message_id,
                    "output_index": 0,
                    "content_index": 0,
                    "text": accumulated_reasoning,
                    "sequence_number": sequence_number,
                }
            )
            sequence_number += 1

        yield self._validate_responses_event(
            {
                "type": "response.output_item.done",
                "output_index": 0,
                "item": {
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
                },
                "sequence_number": sequence_number,
            }
        )
        sequence_number += 1

        for state in tool_call_states.values():
            yield self._validate_responses_event(
                {
                    "type": "response.function_call_arguments.done",
                    "item_id": state["item_id"],
                    "output_index": state["output_index"],
                    "arguments": state["args"],
                    "sequence_number": sequence_number,
                }
            )
            sequence_number += 1
            yield self._validate_responses_event(
                {
                    "type": "response.output_item.done",
                    "output_index": state["output_index"],
                    "item": {
                        "id": state["item_id"],
                        "type": "function_call",
                        "call_id": state["call_id"],
                        "name": state["name"],
                        "arguments": state["args"],
                        "status": "completed",
                    },
                    "sequence_number": sequence_number,
                }
            )
            sequence_number += 1

        yield self._validate_responses_event(
            {
                "type": "response.completed",
                "response": self._build_stream_response_object(
                    response_id,
                    created_at,
                    payload.model,
                    payload,
                    "completed",
                    self._build_stream_output_items(
                        message_id, accumulated_text, tool_call_states
                    ),
                ),
                "sequence_number": sequence_number,
            }
        )
