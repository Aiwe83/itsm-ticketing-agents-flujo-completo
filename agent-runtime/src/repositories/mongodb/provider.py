from __future__ import annotations

from models.provider import DBProvider
from repositories.mongodb.base import MongoDBRepository


class ProviderRepository(MongoDBRepository[DBProvider]):
    collection_name = "providers"

    async def find_by_name(self, name: str) -> DBProvider | None:
        return await self.find_one({"name": name})
