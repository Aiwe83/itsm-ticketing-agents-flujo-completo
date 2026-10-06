from __future__ import annotations

from typing import Any, Literal, Required, TypeAlias, TypedDict


class FunctionCallDict(TypedDict, total=False):
    name: str
    arguments: str


class ChatCompletionToolCallFunctionDict(TypedDict, total=False):
    name: str
    arguments: str


class ChatCompletionMessageToolCallDict(TypedDict, total=False):
    id: str
    type: Literal["function"]
    function: ChatCompletionToolCallFunctionDict


class ChatCompletionCustomToolCallPayloadDict(TypedDict, total=False):
    name: str
    input: str


class ChatCompletionCustomToolCallDict(TypedDict, total=False):
    id: str
    type: Literal["custom"]
    custom: ChatCompletionCustomToolCallPayloadDict


ChatCompletionMessageToolCall: TypeAlias = (
    ChatCompletionMessageToolCallDict | ChatCompletionCustomToolCallDict
)


class ChatCompletionResponseMessageUrlCitationDict(TypedDict, total=False):
    type: Literal["url_citation"]
    url_citation: dict[str, Any]


class ChatCompletionResponseAudioDict(TypedDict, total=False):
    id: str
    expires_at: int
    data: str
    transcript: str


class ChatCompletionResponseMessageDict(TypedDict, total=False):
    role: Literal["assistant"]
    content: Required[str | None]
    reasoning_content: str | None
    refusal: str | None
    tool_calls: list[ChatCompletionMessageToolCall] | None
    annotations: list[ChatCompletionResponseMessageUrlCitationDict] | None
    function_call: FunctionCallDict | None
    audio: ChatCompletionResponseAudioDict | None


class ChatCompletionStreamFunctionCallDict(TypedDict, total=False):
    name: str | None
    arguments: str | None


class ChatCompletionStreamToolCallDict(TypedDict, total=False):
    index: int
    id: str | None
    type: Literal["function"]
    function: ChatCompletionStreamFunctionCallDict | None


class ChatCompletionStreamDeltaDict(TypedDict, total=False):
    role: Literal["assistant"] | None
    content: str | None
    reasoning_content: str | None
    refusal: str | None
    tool_calls: list[ChatCompletionStreamToolCallDict] | None


class ChatCompletionLogprobTokenDict(TypedDict, total=False):
    token: str
    logprob: float
    bytes: list[int] | None


class ChatCompletionTokenLogprobDict(TypedDict, total=False):
    token: str
    logprob: float
    bytes: list[int] | None
    top_logprobs: list[ChatCompletionLogprobTokenDict]


class ChatCompletionChoiceLogprobsDict(TypedDict, total=False):
    content: list[ChatCompletionTokenLogprobDict] | None
    refusal: list[ChatCompletionTokenLogprobDict] | None


class ChatCompletionChoiceDict(TypedDict, total=False):
    index: int
    message: Required[ChatCompletionResponseMessageDict]
    finish_reason: Literal[
        "stop", "length", "tool_calls", "content_filter", "function_call"
    ]
    logprobs: ChatCompletionChoiceLogprobsDict | None


class CompletionTokensDetailsDict(TypedDict, total=False):
    audio: int
    reasoning: int


class PromptTokensDetailsDict(TypedDict, total=False):
    audio: int
    cache_read: int


class CompletionUsageDict(TypedDict, total=False):
    prompt_tokens: Required[int]
    completion_tokens: Required[int]
    total_tokens: Required[int]
    completion_tokens_details: CompletionTokensDetailsDict
    prompt_tokens_details: PromptTokensDetailsDict


class ChatCompletionStreamChoiceDict(TypedDict, total=False):
    index: int
    delta: Required[ChatCompletionStreamDeltaDict]
    finish_reason: (
        Literal["stop", "length", "tool_calls", "content_filter", "function_call"]
        | None
    )
    logprobs: ChatCompletionChoiceLogprobsDict | None


class ChatCompletionResponseDict(TypedDict, total=False):
    id: str
    object: Literal["chat.completion"]
    created: int
    model: str
    choices: Required[list[ChatCompletionChoiceDict]]
    usage: CompletionUsageDict | None
    service_tier: str | None
    system_fingerprint: str | None


class ChatCompletionStreamResponseDict(TypedDict, total=False):
    id: str
    object: Literal["chat.completion.chunk"]
    created: int
    model: str
    choices: Required[list[ChatCompletionStreamChoiceDict]]
    usage: CompletionUsageDict | None
    system_fingerprint: str | None


ChatCompletionLogprobToken: TypeAlias = ChatCompletionLogprobTokenDict
ChatCompletionTokenLogprob: TypeAlias = ChatCompletionTokenLogprobDict
ChatCompletionChoiceLogprobs: TypeAlias = ChatCompletionChoiceLogprobsDict
ChatCompletionChoice: TypeAlias = ChatCompletionChoiceDict
CompletionTokensDetails: TypeAlias = CompletionTokensDetailsDict
PromptTokensDetails: TypeAlias = PromptTokensDetailsDict
CompletionUsage: TypeAlias = CompletionUsageDict
ChatCompletionStreamChoice: TypeAlias = ChatCompletionStreamChoiceDict
ChatCompletionResponse: TypeAlias = ChatCompletionResponseDict
ChatCompletionStreamResponse: TypeAlias = ChatCompletionStreamResponseDict
