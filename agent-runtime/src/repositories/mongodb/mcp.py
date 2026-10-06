from __future__ import annotations

from bson import ObjectId

from models.mcp import DBMCPServer
from repositories.mongodb.base import MongoDBRepository


class MCPServerRepository(MongoDBRepository[DBMCPServer]):
    collection_name = "mcp_servers"

    async def find_by_name(self, name: str) -> DBMCPServer | None:
        return await self.find_one({"name": name})

    async def find_enabled(self, account: str | None = None) -> list[DBMCPServer]:
        filter: dict = {"enabled": True}
        if account is not None:
            filter["account"] = account
        return await self.find_all(filter)

    async def find_enabled_by_names(self, names: tuple[str, ...]) -> list[DBMCPServer]:
        if not names:
            return []
        return await self.find_all({"enabled": True, "name": {"$in": list(names)}})

    async def find_enabled_by_ids(self, ids: tuple[str, ...]) -> list[DBMCPServer]:
        if not ids:
            return []
        return await self.find_all(
            {
                "enabled": True,
                "_id": {"$in": [ObjectId(str(identifier)) for identifier in ids]},
            }
        )

    async def find_by_id(self, id: str | ObjectId) -> DBMCPServer | None:  # type: ignore[override]
        return await super().find_by_id(id)

    async def find_free(self, account: str | None = None) -> list[DBMCPServer]:
        """MCP servers with no authentication."""
        filter: dict = {
            "enabled": True,
            "auth_type": "free",
        }
        if account is not None:
            filter["account"] = account
        return await self.find_all(filter)

    async def find_static_auth(self, account: str | None = None) -> list[DBMCPServer]:
        """MCP servers with static header auth (encrypted API keys, etc.)."""
        filter: dict = {
            "enabled": True,
            "auth_type": "static_headers",
        }
        if account is not None:
            filter["account"] = account
        return await self.find_all(filter)

