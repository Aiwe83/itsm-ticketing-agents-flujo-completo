from __future__ import annotations

from typing import Any, Literal, TypeAlias

import msgspec

from models.openai_compatible.base import (
    PromptCacheRetention,
    ProviderName,
    ReasoningEffort,
    ResponsesReasoningSummary,
    ServiceTier,
    Verbosity,
)
from models.openai_compatible.chat_completions.messages import (
    ChatCompletionRequestMessage,
)

ReasoningSummary: TypeAlias = ResponsesReasoningSummary
SearchContextSize: TypeAlias = Literal["low", "medium", "high"]
AudioFormat: TypeAlias = Literal["wav", "aac", "mp3", "flac", "opus", "pcm16"]


class ReasoningConfig(msgspec.Struct, kw_only=True):
    effort: ReasoningEffort | None = None
    summary: ReasoningSummary | None = None


class TextConfig(msgspec.Struct, kw_only=True):
    verbosity: Verbosity | None = None


class Function(msgspec.Struct, kw_only=True):
    name: str
    description: str | None = None
    parameters: dict[str, Any] | None = None


class CustomFunction(msgspec.Struct, kw_only=True):
    name: str
    description: str | None = None
    format: dict[str, Any] | None = None


class ResponseFormatText(msgspec.Struct, kw_only=True):
    type: Literal["text"] = "text"


class ResponseFormatJsonObject(msgspec.Struct, kw_only=True):
    type: Literal["json_object"] = "json_object"


class ResponseFormatJsonSchema(msgspec.Struct, kw_only=True):
    type: Literal["json_schema"] = "json_schema"
    json_schema: dict[str, Any]


ResponseFormat: TypeAlias = (
    ResponseFormatText | ResponseFormatJsonSchema | ResponseFormatJsonObject
)


class WebSearchApproximateLocation(msgspec.Struct, kw_only=True):
    type: Literal["approximate"] = "approximate"
    country: str | None = None
    region: str | None = None
    city: str | None = None
    timezone: str | None = None


class WebSearchOptions(msgspec.Struct, kw_only=True):
    user_location: WebSearchApproximateLocation | None = None
    search_context_size: SearchContextSize | None = None


class AudioConfig(msgspec.Struct, kw_only=True):
    voice: str
    format: AudioFormat


class ChatCompletionStreamOptions(msgspec.Struct, kw_only=True):
    include_usage: bool | None = None
    include_obfuscation: bool | None = None


class Tool(msgspec.Struct, kw_only=True):
    type: str = "function"
    function: Function | None = None


class CustomTool(msgspec.Struct, kw_only=True):
    type: str = "custom"
    custom: CustomFunction | None = None


class AllowedToolsObject(msgspec.Struct, kw_only=True):
    mode: Literal["auto", "required"]
    tools: list[Tool | CustomTool] = msgspec.field(default_factory=list)


class ChatCompletionsAllowedTools(msgspec.Struct, kw_only=True):
    type: Literal["allowed_tools"]
    allowed_tools: AllowedToolsObject


class PredictionContent(msgspec.Struct, kw_only=True):
    type: Literal["content"] = "content"
    content: str | list[dict[str, Any]]


class ChatCompletionsRequestPayload(msgspec.Struct, kw_only=True):
    provider: ProviderName | None = None
    messages: list[ChatCompletionRequestMessage] = msgspec.field(default_factory=list)
    model: str
    audio: AudioConfig | None = None
    frequency_penalty: float | None = 0
    logit_bias: dict[str, int] | None = None
    logprobs: bool | None = False
    max_completion_tokens: int | None = None
    metadata: dict[str, Any] | None = None
    modalities: list[Literal["text", "audio"]] | None = None
    n: int | None = 1
    parallel_tool_calls: bool = True
    prediction: PredictionContent | None = None
    presence_penalty: float | None = 0
    prompt_cache_key: str | None = None
    prompt_cache_retention: PromptCacheRetention | None = None
    reasoning: ReasoningConfig | None = None
    reasoning_effort: ReasoningEffort | None = None
    response_format: ResponseFormat | None = None
    safety_identifier: str | None = None
    service_tier: ServiceTier = "auto"
    stop: str | list[str] | None = None
    store: bool | None = False
    stream: bool | None = False
    stream_options: ChatCompletionStreamOptions | None = None
    temperature: float | None = None
    tool_choice: (
        Literal["none", "auto", "required"]
        | ChatCompletionsAllowedTools
        | Tool
        | CustomTool
        | None
    ) = None
    tools: list[Tool | CustomTool] | None = None
    top_logprobs: int | None = None
    top_p: float | None = None
    verbosity: Verbosity = "medium"
    web_search_options: WebSearchOptions | None = None
    chat_id: str | None = None

    def __post_init__(self) -> None:
        if self.model.strip().lower() != "gpt-5-nextai":
            return

        if self.reasoning is None:
            self.reasoning = ReasoningConfig(
                effort=self.reasoning_effort or "minimal",
                summary="auto",
            )
        else:
            if self.reasoning.effort is None:
                self.reasoning.effort = self.reasoning_effort or "minimal"
            if self.reasoning.summary is None:
                self.reasoning.summary = "auto"

        if self.reasoning_effort is None:
            self.reasoning_effort = self.reasoning.effort or "minimal"
