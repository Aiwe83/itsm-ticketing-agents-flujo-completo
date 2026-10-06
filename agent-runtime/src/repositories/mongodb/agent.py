from __future__ import annotations

from bson import ObjectId

from models.agent import DBAgent
from repositories.mongodb.base import MongoDBRepository


class AgentRepository(MongoDBRepository[DBAgent]):
    collection_name = "agents"

    async def find_enabled(self) -> list[DBAgent]:
        return await self.find_all({"enabled": True})

    async def find_enabled_by_ids(self, ids: tuple[str, ...]) -> list[DBAgent]:
        return await self.find_all(
            {
                "_id": {"$in": [ObjectId(agent_id) for agent_id in ids]},
                "enabled": True,
            }
        )

    async def find_by_name(self, name: str) -> DBAgent | None:
        return await self.find_one({"name": name})

    async def find_by_id(self, id: str | ObjectId) -> DBAgent | None:
        return await super().find_by_id(id)

    async def add_tool(self, agent_id: str | ObjectId, tool_id: str | ObjectId) -> bool:
        return await self.update_one(
            {"_id": ObjectId(str(agent_id))},
            {"$addToSet": {"tool_ids": ObjectId(str(tool_id))}},
        )

    async def remove_tool(self, agent_id: str | ObjectId, tool_id: str | ObjectId) -> bool:
        return await self.update_one(
            {"_id": ObjectId(str(agent_id))},
            {"$pull": {"tool_ids": ObjectId(str(tool_id))}},
        )

    async def add_mcp(self, agent_id: str | ObjectId, mcp_id: str | ObjectId) -> bool:
        return await self.update_one(
            {"_id": ObjectId(str(agent_id))},
            {"$addToSet": {"mcp_ids": ObjectId(str(mcp_id))}},
        )

    async def remove_mcp(self, agent_id: str | ObjectId, mcp_id: str | ObjectId) -> bool:
        return await self.update_one(
            {"_id": ObjectId(str(agent_id))},
            {"$pull": {"mcp_ids": ObjectId(str(mcp_id))}},
        )
