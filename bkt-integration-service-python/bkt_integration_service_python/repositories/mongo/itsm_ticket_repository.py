"""Equivalente a src/repositories/itsm-ticket.repository.ts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pymongo.asynchronous.database import AsyncDatabase

from bkt_integration_service_python.core.config import Settings

ITSMTicketStatus = Literal["persisted", "translated", "failed"]


class ITSMTicketRepository:
    def __init__(self, db: AsyncDatabase, settings: Settings) -> None:
        self._collection = db[settings.original_ticket_collection_name]

    async def upsert(
        self, *, id_: str, mesh_id: str, content: dict[str, Any], status: ITSMTicketStatus
    ) -> None:
        now = datetime.now(UTC)
        await self._collection.find_one_and_update(
            {"_id": id_},
            {
                "$set": {"meshId": mesh_id, "content": content, "status": status, "updatedAt": now},
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )

    async def update_status(self, id_: str, status: ITSMTicketStatus) -> None:
        await self._collection.update_one(
            {"_id": id_}, {"$set": {"status": status, "updatedAt": datetime.now(UTC)}}
        )
