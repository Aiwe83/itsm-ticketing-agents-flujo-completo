from __future__ import annotations

from enum import Enum
from typing import Any, Literal, TypeAlias

import msgspec

from models.openai_compatible.base import (
    PromptCacheRetention,
    ProviderName,
    ReasoningEffort,
    ResponsesReasoningSummary,
    ResponsesTruncation,
    ServiceTier,
    Verbosity,
)
from models.openai_compatible.responses.messages import (
    ResponseInput,
    ResponsesInputContent,
)


class ResponsesRequestConversationObject(msgspec.Struct, kw_only=True):
    id: str


ResponsesRequestConversation: TypeAlias = str | ResponsesRequestConversationObject


class ResponseReasoningConfig(msgspec.Struct, kw_only=True):
    effort: ReasoningEffort | None = None
    summary: ResponsesReasoningSummary | None = None
    generate_summary: ResponsesReasoningSummary | None = None


class ResponsesStreamOptions(msgspec.Struct, kw_only=True):
    include_obfuscation: bool | None = None


class ResponsesIncludeEnum(str, Enum):
    FILE_SEARCH_RESULTS = "file_search_call.results"
    WEB_SEARCH_RESULTS = "web_search_call.results"
    WEB_SEARCH_SOURCES = "web_search_call.action.sources"
    MESSAGE_INPUT_IMAGE_URL = "message.input_image.image_url"
    COMPUTER_CALL_OUTPUT_IMAGE_URL = "computer_call_output.output.image_url"
    CODE_INTERPRETER_OUTPUTS = "code_interpreter_call.outputs"
    REASONING_ENCRYPTED_CONTENT = "reasoning.encrypted_content"
    MESSAGE_OUTPUT_TEXT_LOGPROBS = "message.output_text.logprobs"


class ResponsesPrompt(msgspec.Struct, kw_only=True):
    id: str
    version: str | None = None
    variables: dict[str, str | ResponsesInputContent] | None = None


class ResponsePromptVariableInput(msgspec.Struct, kw_only=True):
    value: str | ResponsesInputContent


class Function(msgspec.Struct, kw_only=True):
    name: str
    parameters: dict[str, Any]
    strict: bool
    type: Literal["function"] = "function"
    description: str | None = None


class ResponsesTextFormatText(
    msgspec.Struct, kw_only=True, tag="text", tag_field="type"
):
    pass


class ResponsesTextFormatJsonObject(
    msgspec.Struct, kw_only=True, tag="json_object", tag_field="type"
):
    pass


class ResponsesTextFormatJsonSchema(
    msgspec.Struct, kw_only=True, tag="json_schema", tag_field="type"
):
    json_schema: dict[str, Any] = msgspec.field(name="schema")
    name: str
    description: str | None = None
    strict: bool = False


ResponsesTextFormat: TypeAlias = (
    ResponsesTextFormatText
    | ResponsesTextFormatJsonObject
    | ResponsesTextFormatJsonSchema
)


class TextConfig(msgspec.Struct, kw_only=True):
    verbosity: Verbosity = "medium"
    format: ResponsesTextFormat | None = None


class ResponsesRequestPayload(msgspec.Struct, kw_only=True):
    provider: ProviderName | None = None
    background: bool = False
    conversation: ResponsesRequestConversation | None = None
    include: list[ResponsesIncludeEnum] | None = None
    input: ResponseInput
    instructions: str | None = None
    max_output_tokens: int | None = None
    max_tool_calls: int | None = None
    max_prompt_tokens: int | None = None
    metadata: dict[str, Any] | None = None
    model: str
    parallel_tool_calls: bool = True
    previous_response_id: str | None = None
    prompt: ResponsesPrompt | None = None
    prompt_cache_key: str | None = None
    prompt_cache_retention: PromptCacheRetention | None = None
    reasoning: ResponseReasoningConfig | None = None
    safety_identifier: str | None = None
    service_tier: ServiceTier | None = None
    store: bool = False
    stream: bool = False
    stream_options: ResponsesStreamOptions | None = None
    temperature: float | None = None
    text: TextConfig | None = None
    tool_choice: str | dict[str, Any] | None = None
    tools: list[Function] | None = None
    top_logprobs: int | None = None
    top_p: float | None = None
    truncation: ResponsesTruncation | None = "disabled"
    chat_id: str | None = None
