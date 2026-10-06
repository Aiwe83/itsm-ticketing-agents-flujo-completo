from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Generic, TypeVar

from bson import ObjectId
from pymongo.asynchronous.collection import AsyncCollection

from core.clients.mongodb import MongoDBClient
from repositories.base import BaseRepository

T = TypeVar("T", bound=Mapping[str, Any])


class MongoDBRepository(BaseRepository, Generic[T]):
    collection_name: str

    def __init__(self, client: MongoDBClient) -> None:
        self.client = client

    @property
    def _collection(self) -> AsyncCollection[T]:
        if self.client.client is None:
            raise RuntimeError("MongoDB client is not configured.")
        return self.client.client.get_default_database()[self.collection_name]

    async def find_all(self, filter: dict[str, Any] | None = None) -> list[T]:
        return await self._collection.find(filter or {}).to_list(length=None)

    async def find_one(self, filter: dict[str, Any]) -> T | None:
        return await self._collection.find_one(filter)

    async def find_by_id(self, id: str | ObjectId) -> T | None:
        return await self._collection.find_one({"_id": ObjectId(str(id))})

    async def insert_one(self, document: T) -> str:
        result = await self._collection.insert_one(document)
        return str(result.inserted_id)

    async def update_one(
        self,
        filter: dict[str, Any],
        update: dict[str, Any],
        *,
        upsert: bool = False,
    ) -> bool:
        result = await self._collection.update_one(filter, update, upsert=upsert)
        return result.modified_count > 0

    async def delete_one(self, filter: dict[str, Any]) -> bool:
        result = await self._collection.delete_one(filter)
        return result.deleted_count > 0
