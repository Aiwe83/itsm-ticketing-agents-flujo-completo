from __future__ import annotations

from models.model import DBModel
from repositories.mongodb.base import MongoDBRepository


class ModelRepository(MongoDBRepository[DBModel]):
    collection_name = "models"

    async def find_by_name(self, name: str) -> DBModel | None:
        return await self.find_one({"name": name})

    async def find_by_model_id(self, model_id: str) -> DBModel | None:
        return await self.find_one({"model_id": model_id})

    async def find_enabled(self) -> list[DBModel]:
        return await self.find_all({"enabled": True})

    async def find_enabled_by_name(self, name: str) -> DBModel | None:
        return await self.find_one({"name": name, "enabled": True})

    async def find_enabled_by_model_id(self, model_id: str) -> DBModel | None:
        return await self.find_one({"model_id": model_id, "enabled": True})

    async def find_by_provider_name(self, provider_name: str) -> list[DBModel]:
        return await self.find_all({"provider": provider_name})
