from __future__ import annotations

from enum import Enum
from typing import Literal, TypeAlias

ReasoningEffort: TypeAlias = Literal[
    "none", "minimal", "low", "medium", "high", "xhigh"
]
ResponsesReasoningSummary: TypeAlias = Literal["auto", "concise", "detailed"]
ResponsesTruncation: TypeAlias = Literal["auto", "disabled"]
Verbosity: TypeAlias = Literal["low", "medium", "high"]
PromptCacheRetention: TypeAlias = Literal["in-memory", "24h"]
ImageDetail: TypeAlias = Literal["auto", "low", "high"]
ServiceTier: TypeAlias = Literal["auto", "default", "flex"]


class ProviderName(Enum):
    AZURE_OPENAI = "AzureOpenAI"
    AMAZON_BEDROCK = "AmazonBedrock"
    IBM_WATSONX = "IBMWatsonx"

    @classmethod
    def _missing_(cls, value: object) -> None:
        raise Exception
