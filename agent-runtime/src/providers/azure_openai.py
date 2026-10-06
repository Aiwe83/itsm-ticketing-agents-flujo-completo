import json
import os
import time
from typing import Any, AsyncGenerator, Generator, cast, overload

import msgspec
from langchain_openai import ChatOpenAI
from loguru import logger
from pydantic import SecretStr

from core.errors.base import ApplicationError
from core.logger import get_request_id
from models.openai_compatible.chat_completions.input import (
    ChatCompletionsRequestPayload,
    ReasoningConfig,
)
from models.openai_compatible.chat_completions.messages import (
    ChatCompletionRequestDeveloperMessage,
    ChatCompletionRequestMessage,
    MessageContentTextPart,
)
from models.openai_compatible.chat_completions.output import (
    ChatCompletionResponse,
    ChatCompletionStreamResponse,
)
from models.openai_compatible.responses.input import (
    ResponseReasoningConfig,
    ResponsesRequestPayload,
)
from models.openai_compatible.responses.messages import (
    ResponseInput,
)
from models.openai_compatible.responses.output import (
    ResponsesResponsePayload,
    ResponsesStreamEvent,
)

from .base import ModelRunnable, Provider, ValidateResponse
from .callback import LLMCallLogger


class AzureOpenAIProvider(Provider):
    REASONING_MODELS = {
        "gpt-5-nextai",
        "gpt-5-chat-nextai",
        "gpt-5.2-nextai",
    }

    AVAILABLE_MODELS = {
        "gpt-5-nextai",
        "gpt-5-chat-nextai",
        "gpt-4o-nextai",
        "gpt-4-nextai",
        "gpt-5.2-nextai",
    }

    AUDIO_MODELS: set[str] = set()

    @property
    def provider_name(self) -> str:
        return "AzureOpenAI"

    def get_chat_model(
        self,
        model: str,
        temperature: float | None = None,
        top_p: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatOpenAI:
        """Devuelve un ChatOpenAI con credenciales y parámetros base."""
        resolved = self._normalize_model_name(model)
        if self._cortex_enabled():
            return self._get_cortex_chat_model(
                resolved,
                temperature=temperature,
                top_p=top_p,
                max_tokens=max_tokens,
            )

        params: dict[str, Any] = {
            "base_url": self._responses_base_url(),
            "api_key": SecretStr(self._api_key()),
            "model": resolved,
            "use_responses_api": True,
            "stream_usage": True,
            "callbacks": [LLMCallLogger("Azure OpenAI")],
            "metadata": {"provider": self.provider_name, "model": resolved},
        }
        if temperature is not None:
            params["temperature"] = temperature
        if top_p is not None:
            params["top_p"] = top_p
        if max_tokens is not None:
            params["max_tokens"] = max_tokens
        return ChatOpenAI(**params)

    def _build_llm(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
        streaming: bool = False,
    ) -> ModelRunnable:
        """Construye un ChatOpenAI completamente configurado a partir del payload de la petición."""
        resolved = self._normalize_model_name(payload.model)
        self._apply_gpt5_nextai_reasoning_defaults(payload, resolved)
        is_responses = isinstance(payload, ResponsesRequestPayload)
        max_tokens = (
            payload.max_completion_tokens
            if isinstance(payload, ChatCompletionsRequestPayload)
            else payload.max_output_tokens
        )

        params: dict[str, Any] = {
            "base_url": self._responses_base_url(),
            "api_key": SecretStr(self._api_key()),
            "model": resolved,
            "use_responses_api": True,
            "streaming": streaming,
            "stream_usage": True,
            "callbacks": [LLMCallLogger("Azure OpenAI")],
            "metadata": {
                "provider": self.provider_name,
                "model": resolved,
                "streaming": streaming,
                "api": "responses" if is_responses else "chat_completions",
            },
        }

        if payload.temperature is not None:
            params["temperature"] = payload.temperature
        if payload.top_p is not None:
            params["top_p"] = payload.top_p
        if max_tokens is not None:
            params["max_tokens"] = max_tokens

        model_kwargs: dict[str, Any] = {}

        if isinstance(payload, ChatCompletionsRequestPayload):
            if payload.presence_penalty is not None:
                params["presence_penalty"] = payload.presence_penalty
            if payload.frequency_penalty is not None:
                params["frequency_penalty"] = payload.frequency_penalty
            if payload.stop is not None:
                params["stop"] = (
                    payload.stop if isinstance(payload.stop, list) else [payload.stop]
                )
            if payload.n is not None:
                params["n"] = payload.n
            if payload.logit_bias is not None:
                params["logit_bias"] = payload.logit_bias
            if payload.response_format is not None:
                model_kwargs["response_format"] = self._struct_to_dict(
                    payload.response_format
                )
            if payload.reasoning is not None and self._is_reasoning_model(resolved):
                params["reasoning"] = self._struct_to_dict(payload.reasoning)
            elif payload.reasoning_effort is not None and self._is_reasoning_model(
                resolved
            ):
                params["reasoning_effort"] = payload.reasoning_effort
            if payload.logprobs is not None:
                params["logprobs"] = payload.logprobs
                if payload.top_logprobs is not None:
                    params["top_logprobs"] = payload.top_logprobs
            if streaming:
                stream_opts: dict[str, Any] = {"include_usage": True}
                if payload.stream_options is not None:
                    stream_opts.update(self._struct_to_dict(payload.stream_options))
                model_kwargs["stream_options"] = stream_opts
                params["stream_usage"] = True
        else:
            if payload.reasoning is not None:
                params["reasoning"] = self._struct_to_dict(payload.reasoning)
            if payload.truncation is not None:
                params["truncation"] = payload.truncation
            if payload.include is not None:
                params["include"] = [v.value for v in payload.include]
            if payload.text is not None:
                model_kwargs["text"] = self._struct_to_dict(payload.text)
            if payload.top_logprobs is not None:
                params["top_logprobs"] = payload.top_logprobs
            if payload.instructions is not None:
                model_kwargs["instructions"] = payload.instructions
            if payload.previous_response_id is not None:
                model_kwargs["previous_response_id"] = payload.previous_response_id
            if payload.conversation is not None:
                model_kwargs["conversation"] = (
                    payload.conversation
                    if isinstance(payload.conversation, str)
                    else self._struct_to_dict(payload.conversation)
                )
            if payload.background is not None:
                model_kwargs["background"] = payload.background
            if payload.max_tool_calls is not None:
                model_kwargs["max_tool_calls"] = payload.max_tool_calls
            if payload.prompt is not None:
                model_kwargs["prompt"] = self._struct_to_dict(payload.prompt)
            if payload.service_tier is not None:
                params["service_tier"] = payload.service_tier
            if payload.safety_identifier is not None:
                model_kwargs["safety_identifier"] = payload.safety_identifier
            if payload.prompt_cache_key is not None:
                model_kwargs["prompt_cache_key"] = payload.prompt_cache_key
            if payload.prompt_cache_retention is not None:
                model_kwargs["prompt_cache_retention"] = payload.prompt_cache_retention
            if payload.metadata is not None:
                model_kwargs["metadata"] = payload.metadata
            if streaming and payload.stream_options is not None:
                stream_opts = self._struct_to_dict(payload.stream_options)
                stream_opts.pop(
                    "include_usage", None
                )  # Not supported by Azure Responses
                if stream_opts:
                    model_kwargs["stream_options"] = stream_opts

        if model_kwargs:
            params["model_kwargs"] = model_kwargs

        chat_model = ChatOpenAI(**params)
        llm: ModelRunnable = chat_model

        tools, tool_choice = self._resolve_openai_tool_binding(payload)
        if tools:
            bind_kwargs: dict[str, Any] = {}
            if tool_choice is not None:
                bind_kwargs["tool_choice"] = tool_choice
            if payload.parallel_tool_calls is not None:
                bind_kwargs["parallel_tool_calls"] = payload.parallel_tool_calls
            llm = chat_model.bind(tools=tools, **bind_kwargs)

        return llm

    @staticmethod
    def _strip_nones(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {
                k: AzureOpenAIProvider._strip_nones(v)
                for k, v in obj.items()
                if v is not None
            }
        if isinstance(obj, list):
            return [AzureOpenAIProvider._strip_nones(i) for i in obj]
        return obj

    @classmethod
    def _struct_to_dict(cls, obj: Any) -> Any:
        """Converts a msgspec Struct (or nested structure) to a plain dict, removing None values."""
        return cls._strip_nones(msgspec.to_builtins(obj))

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

    @classmethod
    def _normalize_openai_tool_definition(cls, tool_payload: Any) -> dict[str, Any]:
        tool_dict = cls._struct_to_dict(tool_payload)
        if not isinstance(tool_dict, dict):
            raise ValueError("Unsupported tool payload.")

        if tool_dict.get("type") == "function" and "function" not in tool_dict:
            normalized_function: dict[str, Any] = {
                "type": "function",
                "function": {
                    "name": tool_dict["name"],
                },
            }
            if tool_dict.get("description") is not None:
                normalized_function["function"]["description"] = tool_dict[
                    "description"
                ]
            if tool_dict.get("parameters") is not None:
                normalized_function["function"]["parameters"] = tool_dict["parameters"]
            if tool_dict.get("strict") is not None:
                normalized_function["function"]["strict"] = tool_dict["strict"]
            return normalized_function

        if tool_dict.get("type") == "custom":
            custom_payload = tool_dict.get("custom") or {}
            if not isinstance(custom_payload, dict):
                custom_payload = tool_dict
            if not custom_payload.get("name"):
                raise ValueError("Custom tool requires a name.")
            normalized_custom: dict[str, Any] = {
                "type": "custom",
                "name": custom_payload["name"],
            }
            if custom_payload.get("description") is not None:
                normalized_custom["description"] = custom_payload["description"]
            if custom_payload.get("format") is not None:
                normalized_custom["format"] = custom_payload["format"]
            return normalized_custom

        return tool_dict

    def _normalize_openai_tool_choice(
        self,
        tool_choice: Any,
    ) -> str | dict[str, Any] | None:
        if tool_choice is None:
            return None

        normalized = self._struct_to_dict(tool_choice)
        if isinstance(normalized, str):
            if normalized == "none":
                return "none"
            if normalized in {"auto", "required"}:
                return normalized
            return normalized

        if not isinstance(normalized, dict):
            return None

        choice_type = normalized.get("type")
        if choice_type == "function":
            return normalized
        if choice_type == "custom":
            custom_payload = normalized.get("custom") or {}
            if isinstance(custom_payload, dict) and custom_payload.get("name"):
                return {"type": "custom", "name": custom_payload["name"]}
        if choice_type == "tool" and normalized.get("name"):
            return normalized

        return normalized

    def _resolve_openai_tool_binding(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
    ) -> tuple[list[dict[str, Any]], str | dict[str, Any] | None]:
        if not payload.tools:
            return [], None

        raw_tools = [
            self._normalize_openai_tool_definition(tool) for tool in payload.tools
        ]
        normalized_choice = self._normalize_openai_tool_choice(payload.tool_choice)

        if isinstance(payload, ChatCompletionsRequestPayload):
            choice_payload = (
                self._struct_to_dict(payload.tool_choice)
                if isinstance(payload.tool_choice, msgspec.Struct)
                else payload.tool_choice
            )
            if choice_payload == "none":
                return [], "none"

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
                normalized_choice = "required" if mode == "required" else "auto"

        return raw_tools, normalized_choice

    def _is_reasoning_model(self, model_name: str) -> bool:
        return any(r in model_name.lower() for r in self.REASONING_MODELS)

    @staticmethod
    def _is_gpt5_chat_model(model_name: str) -> bool:
        return model_name.strip().lower() == "gpt-5-chat-nextai"

    def _is_audio_model(self, model_name: str) -> bool:
        return any(a in model_name.lower() for a in self.AUDIO_MODELS)

    @staticmethod
    def _cortex_enabled() -> bool:
        return os.getenv("CORTEX_PROXY_ENABLED", "false").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }

    def _get_cortex_chat_model(
        self,
        resolved_model: str,
        *,
        temperature: float | None = None,
        top_p: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatOpenAI:
        base_url = os.getenv("CORTEX_PROXY_BASE_URL", "").strip().rstrip("/")
        if not base_url:
            raise ApplicationError(
                "CORTEX_PROXY_ENABLED=true requiere CORTEX_PROXY_BASE_URL.",
                status_code=500,
                error_name="cortex_proxy_not_configured",
            )

        provider = os.getenv("CORTEX_PROXY_PROVIDER", "azure").strip() or "azure"
        request_id = get_request_id()
        default_headers = {"X-Session-ID": request_id} if request_id else None

        params: dict[str, Any] = {
            "base_url": base_url,
            "api_key": SecretStr(os.getenv("CORTEX_PROXY_API_KEY") or "cortex-no-auth"),
            "model": resolved_model,
            "use_responses_api": False,
            "disable_streaming": True,
            "extra_body": {"provider": provider},
            "callbacks": [LLMCallLogger("Cortex Proxy")],
            "metadata": {
                "provider": self.provider_name,
                "model": resolved_model,
                "gateway": "cortex",
            },
        }
        if default_headers is not None:
            params["default_headers"] = default_headers
        if temperature is not None:
            params["temperature"] = temperature
        if top_p is not None:
            params["top_p"] = top_p
        if max_tokens is not None:
            params["max_tokens"] = max_tokens

        return ChatOpenAI(**params)

    @staticmethod
    def _api_key() -> str:
        return os.getenv("OPENAI_AZURE_API_KEY") or os.getenv("AZURE_OPENAI_API_KEY", "")

    @staticmethod
    def _responses_base_url() -> str:
        endpoint = (
            os.getenv("RESPONSES_AZURE_ENDPOINT")
            or os.getenv("AZURE_OPENAI_ENDPOINT")
            or ""
        ).strip()
        endpoint = endpoint.rstrip("/")
        if endpoint.endswith("/openai/v1"):
            endpoint = endpoint[: -len("/openai/v1")]
        if not endpoint:
            return "openai/v1"
        return f"{endpoint}/openai/v1"

    @staticmethod
    def _normalize_model_name(model_name: str) -> str:
        """Maps common model names to the concrete deployment name."""
        alias_map = {
            "gpt-5": "gpt-5-chat-nextai",
            "gpt-5-chat": "gpt-5-chat-nextai",
            "gpt-5-reasoning": "gpt-5-nextai",
            "gpt-4o": "gpt-4o-nextai",
            "gpt-4": "gpt-4-nextai",
        }
        return alias_map.get(model_name.strip().lower(), model_name)

    def validate(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
    ) -> ValidateResponse:
        """Valida el payload de la petición según las restricciones de Azure OpenAI API."""
        model_name = self._normalize_model_name(payload.model)
        self._apply_gpt5_nextai_reasoning_defaults(payload, model_name)

        if model_name not in self.AVAILABLE_MODELS:
            return ValidateResponse(
                is_valid=False,
                error_message=(
                    f"El modelo {model_name} no está disponible para el provider "
                    f"{self.provider_name}. Modelos disponibles: "
                    f"{', '.join(self.AVAILABLE_MODELS)}"
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
        """Validaciones específicas para Chat Completions API."""
        if payload.tools is not None:
            for tool in payload.tools:
                # Web search no está disponible en Chat Completions (ni siquiera como función).
                # En Responses API sí existe como built-in (web_search_preview).
                if tool.type == "web_search":
                    return ValidateResponse(
                        is_valid=False,
                        error_message=(
                            "El tipo de herramienta 'web_search' no está soportado en "
                            "Chat Completions. Usa la Responses API con 'web_search_preview'."
                        ),
                    )

        if payload.prediction is not None:
            logger.warning(
                "El parámetro 'prediction' (Predicted Outputs) puede no estar soportado en Azure OpenAI."
            )

        if self._is_reasoning_model(model_name):
            if self._is_gpt5_chat_model(model_name):
                if payload.reasoning_effort is not None:
                    logger.warning(
                        "El parámetro 'reasoning_effort' no está soportado por '{}' en Azure OpenAI. "
                        "Se ignora.",
                        model_name,
                    )
                payload.reasoning_effort = None
                payload.reasoning = None
            # Parámetros no soportados por modelos de razonamiento (o1, o3, o4-mini, gpt-5-nextai).
            # Ref: https://learn.microsoft.com/azure/ai-services/openai/how-to/reasoning
            unsupported = []
            for attr in (
                "temperature",
                "top_p",
                "presence_penalty",
                "frequency_penalty",
                "logprobs",
                "top_logprobs",
                "logit_bias",
                "n",
                "stop",
            ):
                if getattr(payload, attr, None) is not None:
                    unsupported.append(attr)
                    object.__setattr__(payload, attr, None)

            if unsupported:
                logger.warning(
                    "Los parámetros [{}] no están soportados en modelos de razonamiento ({}) "
                    "y han sido eliminados del payload.",
                    ", ".join(unsupported),
                    model_name,
                )

            # parallel_tool_calls no está soportado en ningún modelo de razonamiento de Azure.
            if payload.parallel_tool_calls is True:
                logger.warning(
                    "parallel_tool_calls no está soportado en modelos de razonamiento ({}). "
                    "Se desactiva automáticamente.",
                    model_name,
                )
                payload.parallel_tool_calls = False
        else:
            if payload.reasoning_effort is not None:
                logger.warning(
                    "El parámetro 'reasoning_effort' solo está disponible para modelos de "
                    "razonamiento. Se ignora para '{}'.",
                    model_name,
                )
                payload.reasoning_effort = None

            # verbosity no existe como parámetro de Chat Completions en Azure OpenAI
            # (ni para reasoning ni para non-reasoning). Es ignorado por la API.
            if payload.reasoning is not None:
                logger.warning(
                    "El parÃ¡metro 'reasoning' solo estÃ¡ disponible para modelos de "
                    "razonamiento. Se ignora para '{}'.",
                    model_name,
                )
                payload.reasoning = None

            if payload.verbosity is not None:
                logger.warning(
                    "El parámetro 'verbosity' no está soportado en Chat Completions API. "
                    "En Responses API está disponible como 'text.verbosity' solo para GPT-5."
                )

        if payload.modalities is not None and "audio" in payload.modalities:
            if not self._is_audio_model(model_name):
                return ValidateResponse(
                    is_valid=False,
                    error_message=f"El modelo '{model_name}' no soporta modalidad de audio.",
                )

        if payload.audio is not None:
            if payload.modalities is None or "audio" not in payload.modalities:
                return ValidateResponse(
                    is_valid=False,
                    error_message="El parámetro 'audio' requiere que 'modalities' incluya 'audio'.",
                )
            if not self._is_audio_model(model_name):
                return ValidateResponse(
                    is_valid=False,
                    error_message=f"El modelo '{model_name}' no soporta parámetros de audio.",
                )

        if payload.top_logprobs is not None and not payload.logprobs:
            return ValidateResponse(
                is_valid=False,
                error_message="El parámetro 'top_logprobs' requiere que 'logprobs' sea true.",
            )

        return ValidateResponse(is_valid=True, error_message=None)

    @staticmethod
    def _apply_gpt5_nextai_reasoning_defaults(
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
        model_name: str,
    ) -> None:
        if model_name.strip().lower() != "gpt-5-nextai":
            return

        if isinstance(payload, ChatCompletionsRequestPayload):
            if payload.reasoning is None:
                payload.reasoning = ReasoningConfig(
                    effort=payload.reasoning_effort or "minimal",
                    summary="auto",
                )
            else:
                if payload.reasoning.effort is None:
                    payload.reasoning.effort = payload.reasoning_effort or "minimal"
                if payload.reasoning.summary is None:
                    payload.reasoning.summary = "auto"
            if payload.reasoning_effort is None:
                payload.reasoning_effort = payload.reasoning.effort or "minimal"
            return

        if payload.reasoning is None:
            payload.reasoning = ResponseReasoningConfig(
                effort="minimal",
                summary="auto",
            )
            return

        if payload.reasoning.effort is None:
            payload.reasoning.effort = "minimal"
        if (
            payload.reasoning.summary is None
            and payload.reasoning.generate_summary is None
        ):
            payload.reasoning.summary = "auto"

    def __validate_responses(
        self,
        payload: ResponsesRequestPayload,
        model_name: str,
    ) -> ValidateResponse:
        """Validaciones específicas para Responses API."""
        if payload.tools is not None:
            for tool in payload.tools:
                # web_search_preview IS supported in Azure Responses API; only block legacy "web_search" type
                if tool.type == "web_search":
                    return ValidateResponse(
                        is_valid=False,
                        error_message=(
                            "El tipo de herramienta 'web_search' no está soportado en Azure OpenAI. "
                            "Usa 'web_search_preview' en su lugar."
                        ),
                    )

        if self._is_reasoning_model(model_name):
            unsupported = []
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

            # parallel_tool_calls is not supported for any reasoning model in Azure OpenAI
            if payload.parallel_tool_calls is True:
                logger.warning(
                    "parallel_tool_calls no está soportado en modelos de razonamiento ({}).",
                    model_name,
                )
                payload.parallel_tool_calls = False
        else:
            if payload.reasoning is not None:
                logger.warning(
                    "El parámetro 'reasoning' solo está disponible para modelos de razonamiento. "
                    "El modelo '{}' no es un modelo de razonamiento.",
                    model_name,
                )
                payload.reasoning = None

        if payload.include is not None:
            include_values = {v.value for v in payload.include}
            if (
                "message.output_text.logprobs" in include_values
                and payload.top_logprobs is None
            ):
                logger.warning(
                    "include contiene message.output_text.logprobs pero no se especificó top_logprobs."
                )

        if payload.top_logprobs is not None and (
            payload.include is None
            or "message.output_text.logprobs" not in {v.value for v in payload.include}
        ):
            return ValidateResponse(
                is_valid=False,
                error_message="El parámetro 'top_logprobs' requiere include=['message.output_text.logprobs'].",
            )

        return ValidateResponse(is_valid=True, error_message=None)

    @staticmethod
    def _serialize_responses_messages(
        input: ResponseInput,
    ) -> list[dict[str, Any]] | str:
        if isinstance(input, str):
            return input
        return [
            AzureOpenAIProvider._strip_nones(msgspec.to_builtins(item))
            for item in input
        ]

    @staticmethod
    def _serialize_chat_completions_messages(
        messages: list[ChatCompletionRequestMessage],
    ) -> list[Any]:
        return [
            AzureOpenAIProvider._strip_nones(msgspec.to_builtins(msg))
            for msg in messages
        ]

    @staticmethod
    def _content_mentions_markdown(
        content: str | list[MessageContentTextPart],
    ) -> bool:
        if isinstance(content, str):
            return "markdown" in content.lower()
        for part in content:
            text = (
                part.get("text", "")
                if isinstance(part, dict)
                else getattr(part, "text", "")
            )
            if isinstance(text, str) and "markdown" in text.lower():
                return True
        return False

    @staticmethod
    def _append_markdown_instruction(
        content: str | list[MessageContentTextPart],
        instruction: str,
    ) -> str | list[MessageContentTextPart]:
        if isinstance(content, str):
            return f"{content}\n\n{instruction}" if content else instruction
        updated = list(content)
        updated.append(MessageContentTextPart(text=instruction))
        return updated

    def _ensure_markdown_instructions(
        self,
        payload: ChatCompletionsRequestPayload | ResponsesRequestPayload,
        model_name: str,
    ) -> None:
        if model_name != "gpt-5-nextai":
            return

        instruction = "Responde en Markdown."
        if isinstance(payload, ResponsesRequestPayload):
            if payload.instructions and "markdown" in payload.instructions.lower():
                return
            payload.instructions = (
                f"{payload.instructions}\n\n{instruction}"
                if payload.instructions
                else instruction
            )
            return

        developer_messages = [m for m in payload.messages if m.role == "developer"]
        if developer_messages:
            if any(
                self._content_mentions_markdown(m.content) for m in developer_messages
            ):
                return
            target = developer_messages[0]
            target.content = self._append_markdown_instruction(
                target.content, instruction
            )
            return

        insert_index = 0
        for idx, message in enumerate(payload.messages):
            if getattr(message, "role", None) == "system":
                insert_index = idx + 1
                continue
            break

        payload.messages.insert(
            insert_index,
            ChatCompletionRequestDeveloperMessage(content=instruction),
        )

    def _stream_responses(
        self,
        payload: ResponsesRequestPayload,
    ) -> Generator[ResponsesStreamEvent, None, None]:
        llm = self._build_llm(payload, streaming=True)
        messages = self._serialize_responses_messages(payload.input)
        response_id = f"resp_{int(time.time())}"
        message_id = f"msg_{response_id}"
        created_at = int(time.time())
        sequence_number = 0
        accumulated_text = ""
        accumulated_reasoning = ""
        stream_usage: dict[str, Any] | None = None
        tool_call_states: dict[str, dict[str, Any]] = {}
        next_output_index = 1

        yield {
            "type": "response.created",
            "response": self._build_stream_response_object(
                response_id=response_id,
                created_at=created_at,
                model=payload.model,
                payload=payload,
                status="in_progress",
                output=[],
            ),
            "sequence_number": sequence_number,
        }
        sequence_number += 1

        yield {
            "type": "response.in_progress",
            "response": self._build_stream_response_object(
                response_id=response_id,
                created_at=created_at,
                model=payload.model,
                payload=payload,
                status="in_progress",
                output=[],
            ),
            "sequence_number": sequence_number,
        }
        sequence_number += 1

        yield {
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
                normalized_usage = self._normalize_responses_usage(
                    getattr(chunk, "usage_metadata", None)
                )
                if normalized_usage is not None:
                    stream_usage = normalized_usage
                yield from events
        except Exception as exc:
            yield self._format_responses_error_event(exc, sequence_number)
            return

        yield {
            "type": "response.output_text.done",
            "item_id": message_id,
            "output_index": 0,
            "content_index": 0,
            "text": accumulated_text,
            "sequence_number": sequence_number,
        }
        sequence_number += 1

        if accumulated_reasoning:
            yield {
                "type": "response.reasoning_text.done",
                "item_id": message_id,
                "output_index": 0,
                "content_index": 0,
                "text": accumulated_reasoning,
                "sequence_number": sequence_number,
            }
            sequence_number += 1

        yield {
            "type": "response.output_item.done",
            "output_index": 0,
            "item": {
                "id": message_id,
                "type": "message",
                "role": "assistant",
                "content": [
                    {"type": "output_text", "text": accumulated_text, "annotations": []}
                ],
                "status": "completed",
            },
            "sequence_number": sequence_number,
        }
        sequence_number += 1

        for state in tool_call_states.values():
            yield {
                "type": "response.function_call_arguments.done",
                "item_id": state["item_id"],
                "output_index": state["output_index"],
                "arguments": state["args"],
                "sequence_number": sequence_number,
            }
            sequence_number += 1
            yield {
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
            sequence_number += 1

        completed_response = self._build_stream_response_object(
            response_id=response_id,
            created_at=created_at,
            model=payload.model,
            payload=payload,
            status="completed",
            output=self._build_stream_output_items(
                message_id, accumulated_text, tool_call_states
            ),
        )
        if stream_usage is not None:
            completed_response["usage"] = cast(Any, stream_usage)

        yield {
            "type": "response.completed",
            "response": completed_response,
            "sequence_number": sequence_number,
        }

    async def _astream_responses(
        self, payload: ResponsesRequestPayload
    ) -> AsyncGenerator[ResponsesStreamEvent, None]:
        llm = self._build_llm(payload, streaming=True)
        messages = self._serialize_responses_messages(payload.input)
        response_id = f"resp_{int(time.time())}"
        message_id = f"msg_{response_id}"
        created_at = int(time.time())
        sequence_number = 0
        accumulated_text = ""
        accumulated_reasoning = ""
        stream_usage: dict[str, Any] | None = None
        tool_call_states: dict[str, dict[str, Any]] = {}
        next_output_index = 1

        yield {
            "type": "response.created",
            "response": self._build_stream_response_object(
                response_id=response_id,
                created_at=created_at,
                model=payload.model,
                payload=payload,
                status="in_progress",
                output=[],
            ),
            "sequence_number": sequence_number,
        }
        sequence_number += 1

        yield {
            "type": "response.in_progress",
            "response": self._build_stream_response_object(
                response_id=response_id,
                created_at=created_at,
                model=payload.model,
                payload=payload,
                status="in_progress",
                output=[],
            ),
            "sequence_number": sequence_number,
        }
        sequence_number += 1

        yield {
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
                normalized_usage = self._normalize_responses_usage(
                    getattr(chunk, "usage_metadata", None)
                )
                if normalized_usage is not None:
                    stream_usage = normalized_usage
                for event in events:
                    yield event
        except Exception as exc:
            yield self._format_responses_error_event(exc, sequence_number)
            return

        yield {
            "type": "response.output_text.done",
            "item_id": message_id,
            "output_index": 0,
            "content_index": 0,
            "text": accumulated_text,
            "sequence_number": sequence_number,
        }
        sequence_number += 1

        if accumulated_reasoning:
            yield {
                "type": "response.reasoning_text.done",
                "item_id": message_id,
                "output_index": 0,
                "content_index": 0,
                "text": accumulated_reasoning,
                "sequence_number": sequence_number,
            }
            sequence_number += 1

        yield {
            "type": "response.output_item.done",
            "output_index": 0,
            "item": {
                "id": message_id,
                "type": "message",
                "role": "assistant",
                "content": [
                    {"type": "output_text", "text": accumulated_text, "annotations": []}
                ],
                "status": "completed",
            },
            "sequence_number": sequence_number,
        }
        sequence_number += 1

        for state in tool_call_states.values():
            yield {
                "type": "response.function_call_arguments.done",
                "item_id": state["item_id"],
                "output_index": state["output_index"],
                "arguments": state["args"],
                "sequence_number": sequence_number,
            }
            sequence_number += 1
            yield {
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
            sequence_number += 1

        completed_response = self._build_stream_response_object(
            response_id=response_id,
            created_at=created_at,
            model=payload.model,
            payload=payload,
            status="completed",
            output=self._build_stream_output_items(
                message_id, accumulated_text, tool_call_states
            ),
        )
        if stream_usage is not None:
            completed_response["usage"] = cast(Any, stream_usage)

        yield {
            "type": "response.completed",
            "response": completed_response,
            "sequence_number": sequence_number,
        }

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
        resolved_model = self._normalize_model_name(payload.model)
        self._ensure_markdown_instructions(payload, resolved_model)

        llm = self._build_llm(payload)
        if isinstance(payload, ChatCompletionsRequestPayload):
            response = llm.invoke(
                self._serialize_chat_completions_messages(payload.messages)
            )
            return self._format_to_chat_completions(response, resolved_model)

        response = llm.invoke(self._serialize_responses_messages(payload.input))
        return self._format_to_responses(response, resolved_model, payload)

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
        resolved_model = self._normalize_model_name(payload.model)
        self._ensure_markdown_instructions(payload, resolved_model)

        llm = self._build_llm(payload)
        if isinstance(payload, ChatCompletionsRequestPayload):
            response = await llm.ainvoke(
                self._serialize_chat_completions_messages(payload.messages)
            )
            return self._format_to_chat_completions(response, resolved_model)

        response = await llm.ainvoke(self._serialize_responses_messages(payload.input))
        return self._format_to_responses(response, resolved_model, payload)

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
        resolved_model = self._normalize_model_name(payload.model)
        self._ensure_markdown_instructions(payload, resolved_model)

        if isinstance(payload, ResponsesRequestPayload):
            yield from self._stream_responses(payload)
            return

        llm = self._build_llm(payload, streaming=True)
        serialized_messages = self._serialize_chat_completions_messages(
            payload.messages
        )
        response_id = f"chatcmpl-{int(time.time())}"
        created_time = int(time.time())

        try:
            for chunk in llm.stream(serialized_messages):
                chunk_data = self._format_chunk_to_chat_completions(
                    chunk, response_id, created_time, resolved_model
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
            resolved_model = self._normalize_model_name(payload.model)
            self._ensure_markdown_instructions(payload, resolved_model)

            if isinstance(payload, ResponsesRequestPayload):
                async for chunk in self._astream_responses(payload):
                    yield chunk
                return

            llm = self._build_llm(payload, streaming=True)
            serialized_messages = self._serialize_chat_completions_messages(
                payload.messages
            )
            response_id = f"chatcmpl-{int(time.time())}"
            created_time = int(time.time())
            try:
                async for chunk in llm.astream(serialized_messages):
                    chunk_data = self._format_chunk_to_chat_completions(
                        chunk, response_id, created_time, resolved_model
                    )
                    if chunk_data:
                        yield chunk_data
            except Exception as exc:
                error_event = self._format_responses_error_event(exc)
                logger.error(json.dumps(error_event, indent=2, ensure_ascii=False))
                yield error_event

        return _gen()
