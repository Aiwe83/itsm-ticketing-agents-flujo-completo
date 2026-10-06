from __future__ import annotations

from typing import Any

import msgspec

from models.agent import AgentReasoningConfig, AgentTextConfig
from models.openai_compatible.base import (
    ProviderName,
    ReasoningEffort,
    ResponsesReasoningSummary,
    Verbosity,
)
from models.openai_compatible.responses.input import ResponsesTextFormat
from models.openai_compatible.responses.messages import ResponseInput


class ConfiguredAgentChatRequest(msgspec.Struct, kw_only=True):
    model: str
    provider: ProviderName | None = None
    input: ResponseInput = ""
    instructions: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    max_output_tokens: int | None = None
    reasoning: AgentReasoningConfig | None = None
    text: AgentTextConfig | None = None
    chat_id: str | None = None
    metadata: dict[str, Any] | None = None
    stream: bool = True

    @property
    def verbosity(self) -> Verbosity:
        return self.text.verbosity if self.text is not None else "medium"

    @property
    def response_format(self) -> ResponsesTextFormat | None:
        return self.text.format if self.text is not None else None

    @property
    def reasoning_effort(self) -> ReasoningEffort | None:
        return self.reasoning.effort if self.reasoning is not None else None

    @property
    def reasoning_summary(self) -> ResponsesReasoningSummary | None:
        return self.reasoning.summary if self.reasoning is not None else None


__all__ = ["ConfiguredAgentChatRequest"]
