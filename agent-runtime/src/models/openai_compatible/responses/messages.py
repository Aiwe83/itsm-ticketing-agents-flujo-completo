from __future__ import annotations

from typing import Literal, TypeAlias

import msgspec

from models.openai_compatible.base import ImageDetail


class ResponseInputTextContent(
    msgspec.Struct, kw_only=True, tag="input_text", tag_field="type"
):
    text: str


class ResponseInputImageContent(
    msgspec.Struct, kw_only=True, tag="input_image", tag_field="type"
):
    image_url: str | None = None
    file_id: str | None = None
    detail: ImageDetail = "auto"


class ResponseInputFileContent(
    msgspec.Struct, kw_only=True, tag="input_file", tag_field="type"
):
    file_id: str


ResponsesInputContent: TypeAlias = (
    ResponseInputTextContent | ResponseInputImageContent | ResponseInputFileContent
)


class ResponseInputItem(msgspec.Struct, kw_only=True):
    type: Literal["message"] = "message"
    role: Literal["user", "assistant", "system", "developer"]
    content: str | list[ResponsesInputContent]


ResponseInput: TypeAlias = str | list[ResponseInputItem]
