from __future__ import annotations

from models.chat import ConfiguredAgentChatRequest as ConfiguredAgentChatRequestModel


class ConfiguredAgentChatRequest(ConfiguredAgentChatRequestModel):
    """HTTP request schema for configured agent chat."""


__all__ = ["ConfiguredAgentChatRequest"]
