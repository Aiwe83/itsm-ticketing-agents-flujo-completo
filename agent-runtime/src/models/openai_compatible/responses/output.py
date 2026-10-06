from __future__ import annotations

from typing import Any, Literal, TypeAlias, TypedDict

from models.openai_compatible.base import (
    ImageDetail,
    PromptCacheRetention,
    ReasoningEffort,
    ResponsesReasoningSummary,
    ResponsesTruncation,
    ServiceTier,
    Verbosity,
)


class ResponseError(TypedDict, total=False):
    code: str
    message: str


class ResponseIncompleteDetails(TypedDict, total=False):
    reason: str


class ResponseUsageInputTokensDetails(TypedDict, total=False):
    audio: int
    cache_read: int


class ResponseUsageOutputTokensDetails(TypedDict, total=False):
    audio: int
    reasoning: int


class ResponseUsage(TypedDict, total=False):
    input_tokens: int
    input_token_details: ResponseUsageInputTokensDetails
    output_tokens: int
    output_token_details: ResponseUsageOutputTokensDetails
    total_tokens: int


class ResponseOutputTextContent(TypedDict, total=False):
    type: Literal["output_text"]
    text: str
    annotations: list[dict[str, Any]] | None
    logprobs: list[dict[str, Any]] | None


class ResponseRefusalContent(TypedDict, total=False):
    type: Literal["refusal"]
    refusal: str


ResponseOutputMessageContent: TypeAlias = (
    ResponseOutputTextContent | ResponseRefusalContent
)


class ResponseOutputMessage(TypedDict, total=False):
    id: str
    type: Literal["message"]
    role: Literal["assistant"]
    content: list[ResponseOutputMessageContent]
    status: Literal["in_progress", "completed", "incomplete"]


class WebSearchActionSearch(TypedDict, total=False):
    type: Literal["search"]
    query: str
    sources: list[dict[str, Any]] | None


class WebSearchActionOpenPage(TypedDict, total=False):
    type: Literal["open_page"]
    url: str


class WebSearchActionFind(TypedDict, total=False):
    type: Literal["find"]
    url: str
    pattern: str


WebSearchAction: TypeAlias = (
    WebSearchActionSearch | WebSearchActionOpenPage | WebSearchActionFind
)


class WebSearchToolCall(TypedDict, total=False):
    id: str
    type: Literal["web_search_call"]
    status: Literal["in_progress", "searching", "completed", "failed"]
    action: WebSearchAction


class FileSearchToolCallResult(TypedDict, total=False):
    file_id: str | None
    text: str | None
    filename: str | None
    attributes: dict[str, Any] | None
    score: float | None


class FileSearchToolCall(TypedDict, total=False):
    id: str
    type: Literal["file_search_call"]
    status: Literal[
        "in_progress", "searching", "completed", "incomplete", "failed"
    ]
    queries: list[str]
    results: list[FileSearchToolCallResult] | None


class CodeInterpreterOutputLogs(TypedDict, total=False):
    type: Literal["logs"]
    logs: str


class CodeInterpreterOutputImage(TypedDict, total=False):
    type: Literal["image"]
    url: str


CodeInterpreterOutput: TypeAlias = (
    CodeInterpreterOutputLogs | CodeInterpreterOutputImage
)


class CodeInterpreterToolCall(TypedDict, total=False):
    type: Literal["code_interpreter_call"]
    id: str
    status: Literal[
        "in_progress", "completed", "incomplete", "interpreting", "failed"
    ]
    container_id: str
    code: str | None
    outputs: list[CodeInterpreterOutput] | None


class ComputerToolCall(TypedDict, total=False):
    type: Literal["computer_call"]
    id: str
    call_id: str
    action: dict[str, Any]
    pending_safety_checks: list[dict[str, Any]]
    status: Literal["in_progress", "completed", "incomplete"]


class FunctionToolCall(TypedDict, total=False):
    type: Literal["function_call"]
    call_id: str
    name: str
    arguments: str
    status: Literal["in_progress", "completed", "incomplete"] | None
    id: str | None


class ResponseInputTextContentDict(TypedDict, total=False):
    type: Literal["input_text"]
    text: str


class ResponseInputImageContentDict(TypedDict, total=False):
    type: Literal["input_image"]
    image_url: str | None
    file_id: str | None
    detail: ImageDetail | None


class ResponseInputFileContentDict(TypedDict, total=False):
    type: Literal["input_file"]
    file_id: str


FunctionAndCustomToolCallOutput: TypeAlias = (
    ResponseInputTextContentDict
    | ResponseInputImageContentDict
    | ResponseInputFileContentDict
)


class FunctionToolCallOutput(TypedDict, total=False):
    type: Literal["function_call_output"]
    call_id: str
    output: Any
    status: Literal["in_progress", "completed", "incomplete"] | None
    id: str | None


class CustomToolCall(TypedDict, total=False):
    type: Literal["custom_tool_call"]
    call_id: str
    name: str
    input: str
    id: str | None


class CustomToolCallOutput(TypedDict, total=False):
    type: Literal["custom_tool_call_output"]
    call_id: str
    output: Any
    id: str | None


ResponseOutputItem: TypeAlias = (
    ResponseOutputMessage
    | FileSearchToolCall
    | FunctionToolCall
    | FunctionToolCallOutput
    | WebSearchToolCall
    | ComputerToolCall
    | CodeInterpreterToolCall
    | CustomToolCall
    | CustomToolCallOutput
)


class ResponsesRequestConversationDict(TypedDict, total=False):
    id: str


ResponsesRequestConversation: TypeAlias = str | ResponsesRequestConversationDict


class ResponseReasoningConfigDict(TypedDict, total=False):
    effort: ReasoningEffort | None
    summary: ResponsesReasoningSummary | None
    generate_summary: ResponsesReasoningSummary | None


class ResponsesPromptDict(TypedDict, total=False):
    id: str
    version: str | None
    variables: dict[str, str | FunctionAndCustomToolCallOutput] | None


class FunctionDict(TypedDict, total=False):
    name: str
    parameters: dict[str, Any]
    strict: bool
    type: Literal["function"]
    description: str | None


class ResponsesTextFormatTextDict(TypedDict, total=False):
    type: Literal["text"]


class ResponsesTextFormatJsonObjectDict(TypedDict, total=False):
    type: Literal["json_object"]


class ResponsesTextFormatJsonSchemaDict(TypedDict, total=False):
    type: Literal["json_schema"]
    schema: dict[str, Any]
    name: str
    description: str | None
    strict: bool


class TextConfigDict(TypedDict, total=False):
    verbosity: Verbosity
    format: (
        ResponsesTextFormatTextDict
        | ResponsesTextFormatJsonObjectDict
        | ResponsesTextFormatJsonSchemaDict
        | None
    )


class ResponseObjectDict(TypedDict, total=False):
    background: bool
    conversation: ResponsesRequestConversation | None
    created_at: int
    error: ResponseError | None
    id: str
    incomplete_details: ResponseIncompleteDetails | None
    instructions: str | list[dict[str, Any]] | None
    max_output_tokens: int | None
    max_tool_calls: int | None
    metadata: dict[str, Any] | None
    model: str
    object: Literal["response"]
    output: list[ResponseOutputItem]
    parallel_tool_calls: bool | None
    previous_response_id: str | None
    prompt: ResponsesPromptDict | None
    prompt_cache_key: str | None
    prompt_cache_retention: PromptCacheRetention | None
    reasoning: ResponseReasoningConfigDict | None
    safety_identifier: str | None
    service_tier: ServiceTier | None
    status: Literal[
        "completed", "failed", "in_progress", "cancelled", "queued", "incomplete"
    ]
    temperature: float | None
    text: TextConfigDict | None
    tool_choice: str | dict[str, Any] | None
    tools: list[FunctionDict] | None
    top_logprobs: int | None
    top_p: float | None
    truncation: ResponsesTruncation | None
    usage: ResponseUsage | None


ResponsesResponsePayload: TypeAlias = ResponseObjectDict


class ResponsesStreamEvent(TypedDict, total=False):
    type: str
    sequence_number: int | None
    response: ResponseObjectDict
    item: ResponseOutputItem
    item_id: str
    output_index: int
    content_index: int
    delta: str
    text: str
    arguments: str
    code: str
    message: str
    param: Any
