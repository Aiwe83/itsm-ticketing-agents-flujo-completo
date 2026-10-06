from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from bson import ObjectId
from msgspec import UNSET

from core.errors import ApplicationError, ResourceNotFoundError
from models.common import DeleteResult
from models.model import DBModel, LLMModel
from models.provider import CreateProviderPayload, DBProvider, Provider, UpdateProviderPayload
from repositories.mongodb.model import ModelRepository
from repositories.mongodb.provider import ProviderRepository
from services.base import BaseService


class ProviderService(BaseService):
    def __init__(
        self,
        repository: ProviderRepository,
        model_repository: ModelRepository,
    ) -> None:
        self._repository = repository
        self._model_repository = model_repository

    async def list_providers(
        self,
        *,
        enabled: bool | None = None,
    ) -> tuple[Provider, ...]:
        try:
            filter_query: dict[str, Any] = {}
            if enabled is not None:
                filter_query["enabled"] = enabled

            documents = await self._repository.find_all(filter_query or None)
            providers: list[Provider] = []
            for document in sorted(
                documents,
                key=lambda current: str(current.get("name", "")).lower(),
            ):
                providers.append(await self._to_model(document))
            return tuple(providers)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to list providers.",
                status_code=500,
                exception=exc,
                error_name="provider_query_error",
            ) from exc

    async def get_provider(self, provider_id: str) -> Provider:
        try:
            normalized_provider_id = self._normalize_object_id(
                provider_id,
                field_name="provider_id",
            )
            return await self._to_model(await self._get_document(normalized_provider_id))
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to load provider.",
                status_code=500,
                exception=exc,
                error_name="provider_query_error",
            ) from exc

    async def create_provider(self, payload: CreateProviderPayload) -> Provider:
        try:
            name = self._normalize_name(payload.name)
            await self._ensure_name_available(name)
            now = self._utcnow()

            provider_id = await self._repository.insert_one(
                {
                    "name": name,
                    "description": self._normalize_optional_text(payload.description),
                    "base_url": self._normalize_base_url(payload.base_url),
                    "metadata": self._normalize_metadata(payload.metadata),
                    "enabled": payload.enabled,
                    "created_at": now,
                    "last_modified_at": now,
                }
            )
            return await self.get_provider(provider_id)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to create provider.",
                status_code=500,
                exception=exc,
                error_name="provider_mutation_error",
            ) from exc

    async def update_provider(self, provider_id: str, payload: UpdateProviderPayload) -> Provider:
        try:
            document = await self._get_document(provider_id)
            update_fields: dict[str, Any] = {}

            if payload.name is not UNSET:
                raise ApplicationError(
                    message="Provider name cannot be changed.",
                    status_code=400,
                    error_name="provider_name_immutable",
                )

            if payload.description is not UNSET:
                update_fields["description"] = self._normalize_optional_text(payload.description)

            if payload.base_url is not UNSET:
                update_fields["base_url"] = self._normalize_base_url(payload.base_url)

            if payload.metadata is not UNSET:
                update_fields["metadata"] = self._normalize_metadata(payload.metadata)

            if payload.enabled is not UNSET:
                update_fields["enabled"] = payload.enabled

            if update_fields:
                update_fields["last_modified_at"] = self._utcnow()
                await self._repository.update_one(
                    {"_id": ObjectId(provider_id)},
                    {"$set": update_fields},
                )

            return await self.get_provider(str(document.get("_id", provider_id)))
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to update provider.",
                status_code=500,
                exception=exc,
                error_name="provider_mutation_error",
            ) from exc

    async def delete_provider(self, provider_id: str) -> DeleteResult:
        try:
            document = await self._get_document(provider_id)
            provider_name = str(document.get("name", ""))
            linked_models = await self._model_repository.find_by_provider_name(provider_name)
            if linked_models:
                raise ApplicationError(
                    message=f"Provider '{provider_name}' is still referenced by models.",
                    status_code=409,
                    error_name="provider_in_use",
                )

            deleted = await self._repository.delete_one({"_id": ObjectId(provider_id)})
            if not deleted:
                raise ResourceNotFoundError(f"Provider '{provider_id}' was not found.")
            return DeleteResult(id=provider_id, deleted=True)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ApplicationError(
                message="Unable to delete provider.",
                status_code=500,
                exception=exc,
                error_name="provider_mutation_error",
            ) from exc

    async def ensure_provider_exists(self, provider_name: str) -> None:
        normalized_name = self._normalize_name(provider_name)
        document = await self._repository.find_by_name(normalized_name)
        if document is None:
            raise ApplicationError(
                message=f"Provider '{normalized_name}' was not found.",
                status_code=400,
                error_name="provider_not_found",
            )

    async def _get_document(self, provider_id: str) -> DBProvider:
        normalized_provider_id = self._normalize_object_id(provider_id, field_name="provider_id")
        document = await self._repository.find_by_id(normalized_provider_id)
        if document is None:
            raise ResourceNotFoundError(f"Provider '{provider_id}' was not found.")
        return document

    async def _ensure_name_available(self, name: str) -> None:
        existing = await self._repository.find_by_name(name)
        if existing is not None:
            raise ApplicationError(
                message=f"Provider name '{name}' is already in use.",
                status_code=409,
                error_name="provider_name_already_exists",
            )

    async def _to_model(self, document: DBProvider) -> Provider:
        provider_name = str(document.get("name", ""))
        models = await self._model_repository.find_by_provider_name(provider_name)
        return Provider(
            id=str(document.get("_id", "")),
            name=provider_name,
            description=document.get("description"),
            base_url=document.get("base_url"),
            metadata=self._normalize_metadata(document.get("metadata")),
            enabled=bool(document.get("enabled", True)),
            models=tuple(self._to_llm_model(current) for current in models),
            created_at=document.get("created_at"),
            last_modified_at=document.get("last_modified_at"),
        )

    @staticmethod
    def _to_llm_model(document: DBModel) -> LLMModel:
        return LLMModel(
            id=str(document.get("_id", "")),
            name=str(document.get("name", "")),
            provider=str(document.get("provider", "")),
            model_id=str(document.get("model_id", "")),
            description=document.get("description"),
            enabled=bool(document.get("enabled", True)),
        )

    @staticmethod
    def _normalize_name(name: str) -> str:
        normalized = name.strip()
        if not normalized:
            raise ApplicationError(
                message="Provider name cannot be empty.",
                status_code=400,
                error_name="invalid_provider_name",
            )
        return normalized

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @staticmethod
    def _normalize_base_url(value: str | None) -> str | None:
        normalized = ProviderService._normalize_optional_text(value)
        if normalized is None:
            return None
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ApplicationError(
                message=f"Invalid provider base_url '{value}'.",
                status_code=400,
                error_name="invalid_provider_base_url",
            )
        return normalized.rstrip("/")

    @staticmethod
    def _normalize_metadata(value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        return dict(value)

    @staticmethod
    def _normalize_object_id(value: str, *, field_name: str) -> str:
        normalized = value.strip()
        if not normalized or not ObjectId.is_valid(normalized):
            raise ApplicationError(
                message=f"Invalid {field_name} value '{value}'.",
                status_code=400,
                error_name="invalid_object_id",
            )
        return normalized

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)
