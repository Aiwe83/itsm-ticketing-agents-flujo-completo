from __future__ import annotations

import logging
from typing import Any, AsyncGenerator, Dict

from fastapi import HTTPException
from starlette.responses import StreamingResponse

from src.bktcortexproxyllm.services.providers.base import LLMProvider
from src.bktcortexproxyllm.services.providers.azure import AzureOpenAIProvider

logger = logging.getLogger(__name__)


class ProviderFactory:
    """Factory de traducción de peticiones hacia el provider correspondiente."""

    _providers: dict[str, type[LLMProvider]] = {
        "azure": AzureOpenAIProvider,
    }

    @classmethod
    def get_provider(cls, provider_name: str) -> LLMProvider:
        provider_cls = cls._providers.get(provider_name.lower())
        if not provider_cls:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Provider not found: {provider_name}. "
                    f"Available providers: {', '.join(cls._providers)}"
                ),
            )
        return provider_cls()

    @classmethod
    async def process_request(cls, request_data: Dict[str, Any]) -> Any:
        """Punto único de entrada: traduce y reenvía la petición al provider."""
        provider = cls.get_provider(request_data["provider"])

        if bool(request_data.get("stream")):
            return cls._streaming_wrapper(provider=provider, llm_request_data=request_data)

        return await provider.process_request(request_data)

    @classmethod
    async def process_tokenizer_request(cls, request_data: Dict[str, Any]) -> Any:
        """Punto único de entrada usado por el router para tokenizar."""
        provider = cls.get_provider(request_data["provider"])
        return await provider.process_tokenizer_request(request_data)

    @classmethod
    def _streaming_wrapper(
        cls,
        provider: LLMProvider,
        llm_request_data: Dict[str, Any],
    ) -> StreamingResponse:
        """Streaming passthrough del provider."""

        async def gen() -> AsyncGenerator[str, None]:
            async for raw_chunk in provider.process_request_streaming(llm_request_data):
                yield raw_chunk

        return StreamingResponse(gen(), media_type="text/event-stream")
