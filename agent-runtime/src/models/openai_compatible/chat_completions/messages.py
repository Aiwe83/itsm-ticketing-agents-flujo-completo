from __future__ import annotations

from typing import Literal, TypeAlias

import msgspec

from models.openai_compatible.base import ImageDetail


class MessageContentTextPart(msgspec.Struct, kw_only=True):
    type: Literal["text"] = "text"
    text: str


class MessageContentImageURL(msgspec.Struct, kw_only=True):
    url: str
    detail: ImageDetail | None = None


class MessageContentImagePart(msgspec.Struct, kw_only=True):
    type: Literal["image_url"] = "image_url"
    image_url: MessageContentImageURL


class MessageContentInputAudio(msgspec.Struct, kw_only=True):
    data: str
    format: Literal["wav", "mp3"]


class MessageContentAudioPart(msgspec.Struct, kw_only=True):
    type: Literal["input_audio"] = "input_audio"
    input_audio: MessageContentInputAudio


class MessageContentFileObject(msgspec.Struct, kw_only=True):
    filename: str | None = None
    file_data: str | None = None
    file_id: str | None = None


class MessageContentFilePart(msgspec.Struct, kw_only=True):
    type: Literal["file"] = "file"
    file: MessageContentFileObject


class MessageContentRefusalPart(msgspec.Struct, kw_only=True):
    type: Literal["refusal"] = "refusal"
    refusal: str


class MessageContentThinkingPart(msgspec.Struct, kw_only=True):
    type: Literal["thinking"] = "thinking"
    thinking: str


UserContentPart: TypeAlias = (
    MessageContentTextPart
    | MessageContentImagePart
    | MessageContentAudioPart
    | MessageContentFilePart
)
AssistantContentPart: TypeAlias = (
    MessageContentTextPart | MessageContentRefusalPart | MessageContentThinkingPart
)
TextOnlyContentPart: TypeAlias = MessageContentTextPart


class FunctionCall(msgspec.Struct, kw_only=True):
    name: str
    arguments: str


class AssistantAudioRef(msgspec.Struct, kw_only=True):
    id: str


class FunctionToolCall(msgspec.Struct, kw_only=True):
    id: str
    type: Literal["function"] = "function"
    function: FunctionCall


class CustomToolCallPayload(msgspec.Struct, kw_only=True):
    name: str
    input: str


class CustomToolCall(msgspec.Struct, kw_only=True):
    id: str
    type: Literal["custom"] = "custom"
    custom: CustomToolCallPayload


ChatCompletionMessageToolCall: TypeAlias = FunctionToolCall | CustomToolCall


class ChatCompletionRequestDeveloperMessage(msgspec.Struct, kw_only=True):
    content: str | list[TextOnlyContentPart]
    role: Literal["developer"] = "developer"
    name: str | None = None


class ChatCompletionRequestSystemMessage(msgspec.Struct, kw_only=True):
    role: Literal["system"] = "system"
    content: str | list[TextOnlyContentPart]
    name: str | None = None


class ChatCompletionRequestUserMessage(msgspec.Struct, kw_only=True):
    role: Literal["user"] = "user"
    content: str | list[UserContentPart]
    name: str | None = None


class ChatCompletionRequestAssistantMessage(msgspec.Struct, kw_only=True):
    role: Literal["assistant"] = "assistant"
    content: str | list[AssistantContentPart] | None = ""
    refusal: str | None = None
    name: str | None = None
    audio: AssistantAudioRef | None = None
    tool_calls: list[ChatCompletionMessageToolCall] | None = None
    function_call: FunctionCall | None = None


class ChatCompletionRequestToolMessage(msgspec.Struct, kw_only=True):
    role: Literal["tool"] = "tool"
    content: str | list[TextOnlyContentPart]
    tool_call_id: str


ChatCompletionRequestMessage: TypeAlias = (
    ChatCompletionRequestDeveloperMessage
    | ChatCompletionRequestSystemMessage
    | ChatCompletionRequestUserMessage
    | ChatCompletionRequestAssistantMessage
    | ChatCompletionRequestToolMessage
)
