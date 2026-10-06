import os
import time
from typing import Any, AsyncGenerator, Generator, cast, overload

import msgspec
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage
from langchain_ibm import ChatWatsonx

from core.errors.base import ApplicationError
from core.logger import get_logger
from models.openai_compatible.chat_completions.input import ChatCompletionsRequestPayload
from models.openai_compatible.chat_completions.messages import ChatCompletionRequestMessage
from models.openai_compatible.chat_completions.output import (
    ChatCompletionResponse,
    ChatCompletionStreamResponse,
)
from models.openai_compatible.responses.input import (
    ResponsesRequestPayload,
    ResponsesTextFormatJsonSchema,
)
from models.openai_compatible.responses.messages import ResponseInput
from models.openai_compatible.responses.output import ResponsesResponsePayload, ResponsesStreamEvent

from .base import ModelRunnable, Provider, ValidateResponse
from .callback import LLMCallLogger

logger = get_logger()


class IBMWatsonxProvider(Provider):
    # TODO: Sacar de BBDD en lugar de tenerlo hardcodeado.
    REASONING_MODELS: set[str] = set()
    AVAILABLE_MODELS: set[str] = {
        "ibm/granite-3-3-8b-instruct",
        "ibm/granite-4-h-small",
        "meta-llama/llama-3-3-70b-instruct",
        "meta-llama/llama-4-maverick-17b-128e-instruct-fp8",
    }

    @property
    def provider_name(self) -> str:
        return "IBMWatsonx"

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def get_chat_model(
        self,
        model: str,
        temperature: float | None = None,
        top_p: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatWatsonx:
        params: dict[str, Any] = {
            "model_id": self._normalize_model_name(model),
            "project_id": os.getenv("WATSONX_PROJECT_ID", ""),
            "callbacks": [LLMCallLogger("IBM Watsonx")],
            "metadata": {"provider": self.provider_name, "model": model},
        }
        if temperature is not None:
            params["temperature"] = temperature
        if top_p is not None:
            params["top_p"] = top_p
        if max_tokens is not None:
            params["max_completion_tokens"] = max_tokens
        return ChatWatsonx(**params)

    # ------------------------------------------------------------------ #
    # Static helpers                                                       #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _strip_nones(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: IBMWatsonxProvider._strip_nones(v) for k, v in obj.items() if v is not None}
        if isinstance(obj, list):
            return [IBMWatsonxProvider._strip_nones(i) for i in obj]
        return obj

    @classmethod
    def _struct_to_dict(cls, obj: Any) -> Any:
        if isinstance(obj, msgspec.Struct):
            return cls._strip_nones(msgspec.to_builtins(obj))
        if isinstance(obj, dict):
            return cls._strip_nones(obj)
        return obj

    # ------------------------------------------------------------------ #
    # Model utilities                                                      #
    # ------------------------------------------------------------------ #

    def _normalize_model_name(self, model_name: str) -> str:
        if "/" in model_name:
            return model_name
        if "llama-4" in model_name or "llama-3" in model_name:
            return f"meta-llama/{model_name}"
        if "granite" in model_name:
            return f"ibm/{model_name}"
        return model_name

    def _is_reasoning_model(self, model_name: str) -> bool:
        return model_name in self.REASONING_MODELS

    # ------------------------------------------------------------------ #
    # LLM construction                                                     #
    # ------------------------------------------------------------------ #

    def _build_llm(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
        *,
        streaming: bool = False,
    ) -> ModelRunnable:
        params: dict[str, Any] = {
            "model_id": self._normalize_model_name(payload.model),
            "project_id": os.getenv("WATSONX_PROJECT_ID", ""),
            "callbacks": [LLMCallLogger("IBM Watsonx")],
            "metadata": {
                "provider": self.provider_name,
                "model": payload.model,
                "streaming": streaming,
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
            params["max_completion_tokens"] = max_tokens

        if isinstance(payload, ChatCompletionsRequestPayload):
            if payload.frequency_penalty is not None:
                params["frequency_penalty"] = payload.frequency_penalty
            if payload.presence_penalty is not None:
                params["presence_penalty"] = payload.presence_penalty
            if payload.logprobs is not None:
                params["logprobs"] = payload.logprobs
            if payload.top_logprobs is not None:
                params["top_logprobs"] = payload.top_logprobs
            if payload.logit_bias is not None:
                params["logit_bias"] = payload.logit_bias
            if payload.stop is not None:
                params["stop"] = (
                    payload.stop if isinstance(payload.stop, list) else [payload.stop]
                )
            if self._is_reasoning_model(payload.model) and payload.reasoning_effort is not None:
                params["reasoning_effort"] = payload.reasoning_effort
                params["include_reasoning"] = True
        else:
            if (
                self._is_reasoning_model(payload.model)
                and payload.reasoning is not None
                and payload.reasoning.effort is not None
            ):
                params["reasoning_effort"] = payload.reasoning.effort
                params["include_reasoning"] = True

        chat_model = ChatWatsonx(**params)

        # Structured output
        schema = (
            self._extract_structured_output_schema(payload)
            if isinstance(payload, ChatCompletionsRequestPayload)
            else self._extract_structured_output_schema_from_responses(payload)
        )
        if schema and not streaming:
            return chat_model.with_structured_output(schema, include_raw=True)

        llm: ModelRunnable = chat_model

        # Function calling tools via bind_tools
        # Built-in types (web_search, file_search, code_interpreter) are OpenAI-specific and not supported.
        if payload.tools:
            function_tools = [
                t for t in payload.tools
                if not (
                    isinstance(t, msgspec.Struct)
                    and getattr(t, "type", None) in {"web_search_preview", "file_search", "code_interpreter"}
                )
            ]
            if function_tools:
                tools = [self._struct_to_dict(t) for t in function_tools]
                bind_kwargs: dict[str, Any] = {}
                if payload.tool_choice is not None:
                    bind_kwargs["tool_choice"] = (
                        self._struct_to_dict(payload.tool_choice)
                        if isinstance(payload.tool_choice, msgspec.Struct)
                        else payload.tool_choice
                    )
                llm = chat_model.bind_tools(tools, **bind_kwargs)

        return llm

    # ------------------------------------------------------------------ #
    # Structured output schema extraction                                  #
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

    # ------------------------------------------------------------------ #
    # Validation                                                           #
    # ------------------------------------------------------------------ #

    def validate(
        self, payload: ChatCompletionsRequestPayload | ResponsesRequestPayload
    ) -> ValidateResponse:
        model_name = self._normalize_model_name(payload.model)
        if model_name not in self.AVAILABLE_MODELS:
            return ValidateResponse(
                is_valid=False,
                error_message=(
                    f"El modelo {model_name} no esta disponible para el provider {self.provider_name}. "
                    f"Modelos disponibles: {', '.join(sorted(self.AVAILABLE_MODELS))}"
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

    def __validate_chat_completions(
        self,
        payload: ChatCompletionsRequestPayload,
        model_name: str,
    ) -> ValidateResponse:
        # Warn and strip built-in tool types (not supported)
        if payload.tools is not None:
            for t in payload.tools:
                if isinstance(t, msgspec.Struct) and getattr(t, "type", None) in {
                    "web_search_preview", "file_search", "code_interpreter"
                }:
                    logger.warning(
                        "IBMWatsonx no soporta el tipo de tool '{}' en Chat Completions. Se ignorara.",
                        getattr(t, "type", "?"),
                    )

        if payload.prediction is not None:
            logger.warning("IBMWatsonx no soporta prediction (Predicted Outputs). Se ignorara.")
            payload.prediction = None

        if payload.web_search_options is not None:
            logger.warning("IBMWatsonx no soporta web_search_options en Chat Completions. Se ignorara.")
            payload.web_search_options = None

        if payload.modalities is not None and "audio" in payload.modalities:
            return ValidateResponse(
                is_valid=False,
                error_message=f"El modelo '{model_name}' no soporta modalidad de audio en IBMWatsonx.",
            )

        if payload.audio is not None:
            return ValidateResponse(
                is_valid=False,
                error_message="IBMWatsonx no soporta el parametro 'audio' en Chat Completions.",
            )

        if self._is_reasoning_model(model_name):
            unsupported_params: list[str] = []
            if payload.temperature is not None:
                unsupported_params.append("temperature")
                payload.temperature = 1.0
            if payload.top_p is not None:
                unsupported_params.append("top_p")
                payload.top_p = None
            if payload.parallel_tool_calls is True:
                unsupported_params.append("parallel_tool_calls")
                payload.parallel_tool_calls = False
            if unsupported_params:
                logger.warning(
                    "Los parametros [{}] no estan soportados en modelos de razonamiento ({}). Se ignoraran.",
                    ", ".join(unsupported_params),
                    model_name,
                )
        else:
            if payload.reasoning_effort is not None:
                logger.warning(
                    "El parametro 'reasoning_effort' no esta disponible para el modelo '{}' en IBMWatsonx. Se ignorara.",
                    model_name,
                )
                payload.reasoning_effort = None

        return ValidateResponse(is_valid=True, error_message=None)

    def __validate_responses(
        self,
        payload: ResponsesRequestPayload,
        model_name: str,
    ) -> ValidateResponse:
        # Warn and strip built-in tool types (not supported)
        if payload.tools is not None:
            for t in payload.tools:
                if isinstance(t, msgspec.Struct) and getattr(t, "type", None) in {
                    "web_search_preview", "file_search", "code_interpreter"
                }:
                    logger.warning(
                        "IBMWatsonx no soporta el tipo de tool '{}' en Responses. Se ignorara.",
                        getattr(t, "type", "?"),
                    )

        if payload.include is not None:
            logger.warning("IBMWatsonx no soporta include en Responses. Se ignorara.")
            payload.include = None

        if payload.text is not None:
            logger.warning("IBMWatsonx no soporta text.format/text.verbosity en Responses. Se ignorara.")
            payload.text = None

        if payload.conversation is not None:
            logger.warning("IBMWatsonx no soporta conversation en Responses. Se ignorara.")
            payload.conversation = None

        if payload.previous_response_id is not None:
            logger.warning("IBMWatsonx no soporta previous_response_id en Responses. Se ignorara.")
            payload.previous_response_id = None

        if payload.prompt is not None:
            logger.warning("IBMWatsonx no soporta prompt en Responses. Se ignorara.")
            payload.prompt = None

        if payload.max_tool_calls is not None:
            logger.warning("IBMWatsonx no soporta max_tool_calls en Responses. Se ignorara.")
            payload.max_tool_calls = None

        if payload.max_prompt_tokens is not None:
            logger.warning("IBMWatsonx no soporta max_prompt_tokens en Responses. Se ignorara.")
            payload.max_prompt_tokens = None

        if payload.prompt_cache_key is not None:
            logger.warning("IBMWatsonx no soporta prompt_cache_key en Responses. Se ignorara.")
            payload.prompt_cache_key = None

        if payload.prompt_cache_retention is not None:
            logger.warning("IBMWatsonx no soporta prompt_cache_retention en Responses. Se ignorara.")
            payload.prompt_cache_retention = None

        if payload.safety_identifier is not None:
            logger.warning("IBMWatsonx no soporta safety_identifier en Responses. Se ignorara.")
            payload.safety_identifier = None

        if payload.service_tier is not None:
            logger.warning("IBMWatsonx no soporta service_tier en Responses. Se ignorara.")
            payload.service_tier = None

        if payload.truncation is not None and payload.truncation != "disabled":
            logger.warning("IBMWatsonx no soporta truncation en Responses. Se usara 'disabled'.")
            payload.truncation = "disabled"

        if payload.stream_options is not None:
            logger.warning("IBMWatsonx no soporta stream_options en Responses. Se ignorara.")
            payload.stream_options = None

        if payload.top_logprobs is not None:
            logger.warning("IBMWatsonx no soporta top_logprobs en Responses. Se ignorara.")
            payload.top_logprobs = None

        if self._is_reasoning_model(model_name):
            unsupported_params: list[str] = []
            if payload.temperature is not None:
                unsupported_params.append("temperature")
                payload.temperature = 1.0
            if payload.top_p is not None:
                unsupported_params.append("top_p")
                payload.top_p = None
            if payload.parallel_tool_calls is True:
                unsupported_params.append("parallel_tool_calls")
                payload.parallel_tool_calls = False
            if unsupported_params:
                logger.warning(
                    "Los parametros [{}] no estan soportados en modelos de razonamiento ({}). Se ignoraran.",
                    ", ".join(unsupported_params),
                    model_name,
                )
        else:
            if payload.reasoning is not None:
                logger.warning(
                    "El parametro 'reasoning' no esta disponible para el modelo '{}' en IBMWatsonx. Se ignorara.",
                    model_name,
                )
                payload.reasoning = None

        return ValidateResponse(is_valid=True, error_message=None)

    # ------------------------------------------------------------------ #
    # Message coercion – Chat Completions                                  #
    # ------------------------------------------------------------------ #

    def _coerce_chat_completions_messages(
        self,
        messages: list[ChatCompletionRequestMessage],
    ) -> list[AIMessage | HumanMessage | SystemMessage | ToolMessage]:
        result: list[AIMessage | HumanMessage | SystemMessage | ToolMessage] = []
        for msg in messages:
            msg_dict = self._struct_to_dict(msg)
            role = msg_dict.get("role", "user")
            content = msg_dict.get("content", "")
            text_content = self._extract_text_content(content)

            if role in {"system", "developer"}:
                result.append(SystemMessage(content=text_content))
            elif role == "assistant":
                tool_calls = msg_dict.get("tool_calls")
                if tool_calls:
                    result.append(AIMessage(content=text_content, tool_calls=tool_calls))
                else:
                    result.append(AIMessage(content=text_content))
            elif role == "tool":
                tool_call_id = msg_dict.get("tool_call_id", "")
                result.append(ToolMessage(content=text_content, tool_call_id=tool_call_id))
            else:
                result.append(HumanMessage(content=text_content))
        return result

    @staticmethod
    def _extract_text_content(content: Any) -> str:
        """Extrae texto plano de un content field (str o lista de partes)."""
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for part in content:
                if isinstance(part, str):
                    parts.append(part)
                    continue
                if isinstance(part, dict):
                    part_type = part.get("type", "")
                    if part_type == "text":
                        parts.append(str(part.get("text", "")))
                    elif part_type in {"image_url", "input_image", "input_audio", "audio"}:
                        logger.warning(
                            "IBMWatsonx no soporta contenido de tipo '{}'. Se omitira.", part_type
                        )
            return "".join(parts)
        return str(content)

    # ------------------------------------------------------------------ #
    # Message coercion – Responses API                                     #
    # ------------------------------------------------------------------ #

    def _normalize_responses_content(self, content: Any) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for part in content:
                if isinstance(part, str):
                    parts.append(part)
                    continue
                part_dict = (
                    self._struct_to_dict(part)
                    if isinstance(part, msgspec.Struct)
                    else (part if isinstance(part, dict) else {})
                )
                part_type = part_dict.get("type")
                if part_type in {"input_text", "text"}:
                    parts.append(str(part_dict.get("text", "")))
                elif part_type in {"input_image", "input_file"}:
                    logger.warning(
                        "IBMWatsonx no soporta '{}' en Responses.input. El adjunto se omitira.", part_type
                    )
                else:
                    fallback_text = part_dict.get("text")
                    if isinstance(fallback_text, str):
                        parts.append(fallback_text)
                    else:
                        logger.warning(
                            "IBMWatsonx recibio un tipo de contenido no soportado en Responses.input ({}). Se omitira.",
                            part_type,
                        )
            return "".join(parts).strip()
        return str(content)

    def _serialize_responses_messages(
        self,
        input: ResponseInput,
    ) -> list[AIMessage | HumanMessage | SystemMessage] | str:
        if isinstance(input, str):
            return input

        messages: list[AIMessage | HumanMessage | SystemMessage] = []
        for item in input:
            item_dict = (
                self._struct_to_dict(item)
                if isinstance(item, msgspec.Struct)
                else (item if isinstance(item, dict) else {})
            )
            role = item_dict.get("role", "user")
            if role == "developer":
                role = "system"
            if role not in {"user", "assistant", "system"}:
                role = "user"

            normalized_content = self._normalize_responses_content(item_dict.get("content"))
            if normalized_content == "":
                logger.warning(
                    "IBMWatsonx omite un item de Responses.input sin contenido textual util."
                )
                continue

            if role == "system":
                messages.append(SystemMessage(content=normalized_content))
            elif role == "assistant":
                messages.append(AIMessage(content=normalized_content))
            else:
                messages.append(HumanMessage(content=normalized_content))

        if not messages:
            logger.warning(
                "IBMWatsonx no recibio contenido textual util en Responses.input tras omitir adjuntos."
            )
            return ""
        return messages

    @staticmethod
    def _apply_responses_instructions(
        messages: str | list[Any],
        instructions: str | None,
    ) -> list[Any] | str:
        if not instructions:
            return messages
        system_msg = SystemMessage(content=instructions)
        if isinstance(messages, str):
            if messages:
                return [system_msg, HumanMessage(content=messages)]
            return [system_msg]
        return [system_msg, *messages]

    # ------------------------------------------------------------------ #
    # Invoke                                                               #
    # ------------------------------------------------------------------ #

    @overload
    def invoke(self, payload: ChatCompletionsRequestPayload) -> ChatCompletionResponse: ...

    @overload
    def invoke(self, payload: ResponsesRequestPayload) -> ResponsesResponsePayload: ...

    def invoke(
        self, payload: ChatCompletionsRequestPayload | ResponsesRequestPayload
    ) -> ChatCompletionResponse | ResponsesResponsePayload:
        validation_result = self.validate(payload)
        if validation_result.get("is_valid") is not True:
            raise ApplicationError(
                validation_result.get("error_message") or "",
                status_code=400,
                error_name="ValidationError",
            )
        resolved_model = self._normalize_model_name(payload.model)
        llm = self._build_llm(payload)

        if isinstance(payload, ChatCompletionsRequestPayload):
            messages = self._coerce_chat_completions_messages(payload.messages)
            raw = llm.invoke(messages)
            response = self._coerce_llm_response_to_ai_message(raw)
            return self._format_to_chat_completions(response, resolved_model)

        messages_r = self._serialize_responses_messages(payload.input)
        messages_r = self._apply_responses_instructions(messages_r, payload.instructions)
        raw = llm.invoke(messages_r)
        response = self._coerce_llm_response_to_ai_message(raw)
        return self._format_to_responses(response, resolved_model, payload)

    @overload
    async def ainvoke(self, payload: ChatCompletionsRequestPayload) -> ChatCompletionResponse: ...

    @overload
    async def ainvoke(self, payload: ResponsesRequestPayload) -> ResponsesResponsePayload: ...

    async def ainvoke(
        self, payload: ChatCompletionsRequestPayload | ResponsesRequestPayload
    ) -> ChatCompletionResponse | ResponsesResponsePayload:
        validation_result = await self.avalidate(payload)
        if validation_result.get("is_valid") is not True:
            raise ApplicationError(
                validation_result.get("error_message") or "",
                status_code=400,
                error_name="ValidationError",
            )
        resolved_model = self._normalize_model_name(payload.model)
        llm = self._build_llm(payload)

        if isinstance(payload, ChatCompletionsRequestPayload):
            messages = self._coerce_chat_completions_messages(payload.messages)
            raw = await llm.ainvoke(messages)
            response = self._coerce_llm_response_to_ai_message(raw)
            return self._format_to_chat_completions(response, resolved_model)

        messages_r = self._serialize_responses_messages(payload.input)
        messages_r = self._apply_responses_instructions(messages_r, payload.instructions)
        raw = await llm.ainvoke(messages_r)
        response = self._coerce_llm_response_to_ai_message(raw)
        return self._format_to_responses(response, resolved_model, payload)

    # ------------------------------------------------------------------ #
    # Stream                                                               #
    # ------------------------------------------------------------------ #

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

        resolved_model = self._normalize_model_name(payload.model)
        llm = self._build_llm(payload, streaming=True)
        messages = self._coerce_chat_completions_messages(payload.messages)
        response_id = f"chatcmpl-{int(time.time())}"
        created_time = int(time.time())

        try:
            for chunk in llm.stream(messages):
                if isinstance(chunk, AIMessageChunk):
                    chunk_data = self._format_chunk_to_chat_completions(
                        chunk, response_id, created_time, resolved_model
                    )
                    if chunk_data:
                        yield chunk_data
        except Exception as exc:
            yield cast(ChatCompletionStreamResponse, self._format_responses_error_event(exc))

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

            resolved_model = self._normalize_model_name(payload.model)
            llm = self._build_llm(payload, streaming=True)
            messages = self._coerce_chat_completions_messages(payload.messages)
            response_id = f"chatcmpl-{int(time.time())}"
            created_time = int(time.time())

            try:
                async for chunk in llm.astream(messages):
                    if isinstance(chunk, AIMessageChunk):
                        chunk_data = self._format_chunk_to_chat_completions(
                            chunk, response_id, created_time, resolved_model
                        )
                        if chunk_data:
                            yield chunk_data
            except Exception as exc:
                yield cast(ChatCompletionStreamResponse, self._format_responses_error_event(exc))

        return _gen()

    # ------------------------------------------------------------------ #
    # Responses streaming                                                  #
    # ------------------------------------------------------------------ #

    def _stream_responses(
        self,
        payload: ResponsesRequestPayload,
    ) -> Generator[ResponsesStreamEvent, None, None]:
        llm = self._build_llm(payload, streaming=True)
        messages = self._serialize_responses_messages(payload.input)
        messages = self._apply_responses_instructions(messages, payload.instructions)
        response_id = f"resp_{int(time.time())}"
        message_id = f"msg_{response_id}"
        created_at = int(time.time())
        sequence_number = 0
        accumulated_text = ""
        accumulated_reasoning = ""
        tool_call_states: dict[str, dict[str, Any]] = {}
        next_output_index = 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.created",
            "response": self._build_stream_response_object(
                response_id=response_id, created_at=created_at, model=payload.model,
                payload=payload, status="in_progress", output=[],
            ),
            "sequence_number": sequence_number,
        })
        sequence_number += 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.in_progress",
            "response": self._build_stream_response_object(
                response_id=response_id, created_at=created_at, model=payload.model,
                payload=payload, status="in_progress", output=[],
            ),
            "sequence_number": sequence_number,
        })
        sequence_number += 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.output_item.added",
            "output_index": 0,
            "item": {
                "id": message_id, "type": "message", "role": "assistant",
                "content": [{"type": "output_text", "text": "", "annotations": []}],
                "status": "in_progress",
            },
            "sequence_number": sequence_number,
        })
        sequence_number += 1

        try:
            for chunk in llm.stream(messages):
                (
                    events, sequence_number, next_output_index, text_delta, reasoning_delta,
                ) = self._format_chunk_to_responses(
                    chunk, message_id, sequence_number, tool_call_states, next_output_index,
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

        yield cast(ResponsesStreamEvent, {
            "type": "response.output_text.done",
            "item_id": message_id, "output_index": 0, "content_index": 0,
            "text": accumulated_text, "sequence_number": sequence_number,
        })
        sequence_number += 1

        if accumulated_reasoning:
            yield cast(ResponsesStreamEvent, {
                "type": "response.reasoning_text.done",
                "item_id": message_id, "output_index": 0, "content_index": 0,
                "text": accumulated_reasoning, "sequence_number": sequence_number,
            })
            sequence_number += 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.output_item.done",
            "output_index": 0,
            "item": {
                "id": message_id, "type": "message", "role": "assistant",
                "content": [{"type": "output_text", "text": accumulated_text, "annotations": []}],
                "status": "completed",
            },
            "sequence_number": sequence_number,
        })
        sequence_number += 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.completed",
            "response": self._build_stream_response_object(
                response_id=response_id, created_at=created_at, model=payload.model,
                payload=payload, status="completed",
                output=self._build_stream_output_items(message_id, accumulated_text, tool_call_states),
            ),
            "sequence_number": sequence_number,
        })

    async def _astream_responses(
        self, payload: ResponsesRequestPayload
    ) -> AsyncGenerator[ResponsesStreamEvent, None]:
        llm = self._build_llm(payload, streaming=True)
        messages = self._serialize_responses_messages(payload.input)
        messages = self._apply_responses_instructions(messages, payload.instructions)
        response_id = f"resp_{int(time.time())}"
        message_id = f"msg_{response_id}"
        created_at = int(time.time())
        sequence_number = 0
        accumulated_text = ""
        accumulated_reasoning = ""
        tool_call_states: dict[str, dict[str, Any]] = {}
        next_output_index = 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.created",
            "response": self._build_stream_response_object(
                response_id=response_id, created_at=created_at, model=payload.model,
                payload=payload, status="in_progress", output=[],
            ),
            "sequence_number": sequence_number,
        })
        sequence_number += 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.in_progress",
            "response": self._build_stream_response_object(
                response_id=response_id, created_at=created_at, model=payload.model,
                payload=payload, status="in_progress", output=[],
            ),
            "sequence_number": sequence_number,
        })
        sequence_number += 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.output_item.added",
            "output_index": 0,
            "item": {
                "id": message_id, "type": "message", "role": "assistant",
                "content": [{"type": "output_text", "text": "", "annotations": []}],
                "status": "in_progress",
            },
            "sequence_number": sequence_number,
        })
        sequence_number += 1

        try:
            async for chunk in llm.astream(messages):
                (
                    events, sequence_number, next_output_index, text_delta, reasoning_delta,
                ) = self._format_chunk_to_responses(
                    chunk, message_id, sequence_number, tool_call_states, next_output_index,
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

        yield cast(ResponsesStreamEvent, {
            "type": "response.output_text.done",
            "item_id": message_id, "output_index": 0, "content_index": 0,
            "text": accumulated_text, "sequence_number": sequence_number,
        })
        sequence_number += 1

        if accumulated_reasoning:
            yield cast(ResponsesStreamEvent, {
                "type": "response.reasoning_text.done",
                "item_id": message_id, "output_index": 0, "content_index": 0,
                "text": accumulated_reasoning, "sequence_number": sequence_number,
            })
            sequence_number += 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.output_item.done",
            "output_index": 0,
            "item": {
                "id": message_id, "type": "message", "role": "assistant",
                "content": [{"type": "output_text", "text": accumulated_text, "annotations": []}],
                "status": "completed",
            },
            "sequence_number": sequence_number,
        })
        sequence_number += 1

        yield cast(ResponsesStreamEvent, {
            "type": "response.completed",
            "response": self._build_stream_response_object(
                response_id=response_id, created_at=created_at, model=payload.model,
                payload=payload, status="completed",
                output=self._build_stream_output_items(message_id, accumulated_text, tool_call_states),
            ),
            "sequence_number": sequence_number,
        })
