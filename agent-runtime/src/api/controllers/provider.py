from __future__ import annotations

from dishka import FromDishka
from litestar import delete, get, post, put

from api.controllers.base import BaseController
from api.schemas.provider import (
    CreateProviderRequest,
    ProviderResponse,
    UpdateProviderRequest,
)
from models.common import DeleteResult
from services.provider import ProviderService


class ProviderController(BaseController):
    path = "/providers"
    tags = ["providers"]

    @get(path="", operation_id="ListProviders")
    async def list_providers(
        self,
        provider_service: FromDishka[ProviderService],
        enabled: bool | None = None,
    ) -> tuple[ProviderResponse, ...]:
        result = await provider_service.list_providers(enabled=enabled)
        return tuple(ProviderResponse.from_model(provider) for provider in result)

    @get(path="/{provider_id:str}", operation_id="GetProvider")
    async def get_provider(
        self,
        provider_id: str,
        provider_service: FromDishka[ProviderService],
    ) -> ProviderResponse:
        result = await provider_service.get_provider(provider_id)
        return ProviderResponse.from_model(result)

    @post(path="", operation_id="CreateProvider", status_code=201)
    async def create_provider(
        self,
        data: CreateProviderRequest,
        provider_service: FromDishka[ProviderService],
    ) -> ProviderResponse:
        result = await provider_service.create_provider(data)
        return ProviderResponse.from_model(result)

    @put(path="/{provider_id:str}", operation_id="UpdateProvider")
    async def update_provider(
        self,
        provider_id: str,
        data: UpdateProviderRequest,
        provider_service: FromDishka[ProviderService],
    ) -> ProviderResponse:
        result = await provider_service.update_provider(provider_id, data)
        return ProviderResponse.from_model(result)

    @delete(path="/{provider_id:str}", operation_id="DeleteProvider", status_code=200)
    async def delete_provider(
        self,
        provider_id: str,
        provider_service: FromDishka[ProviderService],
    ) -> DeleteResult:
        return await provider_service.delete_provider(provider_id)
