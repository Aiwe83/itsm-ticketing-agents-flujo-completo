"""Equivalente a src/repositories/mapping.repository.ts."""

from __future__ import annotations

from pymongo.asynchronous.database import AsyncDatabase

from bkt_integration_service_python.core.config import Settings
from bkt_integration_service_python.domain.models import Mapping


class MappingRepository:
    def __init__(self, db: AsyncDatabase, settings: Settings) -> None:
        self._collection = db[settings.mappings_collection_name]

    async def find_by_context(self, mesh_id: str) -> list[Mapping]:
        cursor = self._collection.find({"meshId": mesh_id}).sort("createdAt", 1)
        docs = await cursor.to_list()
        return [Mapping.from_mongo(doc) for doc in docs]
