from __future__ import annotations

from bson import ObjectId

from models.tool import DBTool
from repositories.mongodb.base import MongoDBRepository


class ToolRepository(MongoDBRepository[DBTool]):
    collection_name = "tools"

    async def find_enabled(self) -> list[DBTool]:
        return await self.find_all({"enabled": True})

    async def find_by_name(self, name: str) -> DBTool | None:
        return await self.find_one({"name": name})

    async def find_enabled_by_names(self, names: tuple[str, ...]) -> list[DBTool]:
        if not names:
            return []
        return await self.find_all({"enabled": True, "name": {"$in": list(names)}})

    async def find_enabled_by_ids(self, ids: tuple[str, ...]) -> list[DBTool]:
        if not ids:
            return []
        return await self.find_all(
            {
                "enabled": True,
                "_id": {"$in": [ObjectId(str(identifier)) for identifier in ids]},
            }
        )

    async def find_by_id(self, id: str | ObjectId) -> DBTool | None:
        return await super().find_by_id(id)
