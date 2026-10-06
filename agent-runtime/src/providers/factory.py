from __future__ import annotations

from collections.abc import Sequence
from typing import TypeAlias

from core.errors.base import ApplicationError
from models.openai_compatible.base import ProviderName
from providers.amazon_bedrock import AmazonBedrockProvider
from providers.azure_openai import AzureOpenAIProvider
from providers.base import Provider
from providers.ibm_watsonx import IBMWatsonxProvider

ProviderType: TypeAlias = type[Provider]
PROVIDER_TYPES: tuple[ProviderType, ...] = (
    AzureOpenAIProvider,
    AmazonBedrockProvider,
    IBMWatsonxProvider,
)


def _matching_provider_types(model: str) -> list[ProviderType]:
    normalized_model = model.strip()
    matches: list[ProviderType] = []
    for provider_type in PROVIDER_TYPES:
        available_models = getattr(provider_type, "AVAILABLE_MODELS", ())
        if normalized_model in available_models:
            matches.append(provider_type)
    return matches


def get_provider_name_for_model(model: str) -> str:
    """Resuelve el nombre del provider a partir de un nombre de modelo único."""
    matches = _matching_provider_types(model)
    if not matches:
        raise ApplicationError(
            message=f"No provider is registered for model '{model}'.",
            status_code=400,
        )
    if len(matches) > 1:
        raise ApplicationError(
            message=f"Model '{model}' is registered in multiple providers.",
            status_code=500,
        )
    return matches[0]().provider_name


def get_provider_for_model(model: str) -> Provider:
    """Construye el provider correspondiente al modelo indicado."""
    matches = _matching_provider_types(model)
    if not matches:
        raise ApplicationError(
            message=f"No provider is registered for model '{model}'.",
            status_code=400,
        )
    if len(matches) > 1:
        raise ApplicationError(
            message=f"Model '{model}' is registered in multiple providers.",
            status_code=500,
        )
    return matches[0]()


def provider_name_matches(
    *,
    provider_name: ProviderName | str,
    expected_provider_name: str,
) -> bool:
    """Compara nombres de provider aceptando enums o strings del contrato."""
    raw_name = (
        provider_name.value if isinstance(provider_name, ProviderName) else provider_name
    )
    return str(raw_name).strip().lower() == expected_provider_name.strip().lower()
