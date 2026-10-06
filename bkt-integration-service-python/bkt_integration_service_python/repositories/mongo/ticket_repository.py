"""Equivalente a src/repositories/ticket.repository.ts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from bkt_integration_service_python.core.config import Settings


class TicketRepository:
    def __init__(self, db: AsyncDatabase, settings: Settings) -> None:
        self._collection = db[settings.processed_ticket_collection_name]
        self._mesh_id = settings.mesh_id

    # La identidad de un ticket procesado es meshId + key (indice unico
    # meshId_1_key_1), no su _id: es un UUID opaco generado una sola vez,
    # en el insert, y se mantiene entre upserts posteriores del mismo ticket.
    async def upsert(self, *, key: str, content: dict[str, Any]) -> dict[str, Any] | None:
        now = datetime.now(UTC)
        return await self._collection.find_one_and_update(
            {"meshId": self._mesh_id, "key": key},
            {
                "$set": {"content": content, "updatedAt": now},
                "$setOnInsert": {
                    "_id": str(uuid4()),
                    "meshId": self._mesh_id,
                    "key": key,
                    "createdAt": now,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
