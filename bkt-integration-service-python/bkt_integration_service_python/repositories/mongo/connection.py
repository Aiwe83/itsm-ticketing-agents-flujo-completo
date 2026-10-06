"""Conexion Mongo, equivalente a src/config/database.ts + src/config/database-indexes.ts."""

from __future__ import annotations

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from bkt_integration_service_python.core.config import Settings
from bkt_integration_service_python.core.logging import logger


class MongoConnection:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: AsyncMongoClient | None = None

    async def connect(self) -> None:
        try:
            self._client = AsyncMongoClient(
                self._settings.mongodb_url,
                maxPoolSize=self._settings.mongodb_max_pool_size,
                minPoolSize=self._settings.mongodb_min_pool_size,
                serverSelectionTimeoutMS=5000,
                socketTimeoutMS=45000,
            )
            # Fuerza la conexion inicial, equivalente al await mongoose.connect(...).
            await self._client.admin.command("ping")
            logger.info(f"Connected to MongoDB database={self._settings.mongodb_database}")
        except Exception:
            logger.exception("MongoDB connection error")
            raise

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.close()
            logger.info("MongoDB disconnected")

    async def is_connected(self) -> bool:
        if self._client is None:
            return False
        try:
            await self._client.admin.command("ping")
            return True
        except Exception:
            return False

    @property
    def db(self) -> AsyncDatabase:
        if self._client is None:
            raise RuntimeError("MongoConnection.connect() was not called")
        return self._client[self._settings.mongodb_database]

    async def ensure_indexes(self) -> None:
        """Equivalente a src/config/database-indexes.ts.

        El indice unico {meshId, key} en `tickets` solo se crea si NO hay
        duplicados ya existentes en ese momento (logica condicional, no solo
        el indice). Antes este metodo creaba un indice sobre {meshId,
        itsmTicketId}: ese campo dejo de existir cuando el modelo de `tickets`
        paso a `key` (top-level) + `content` libre (ver `ticket_repository.py`,
        que ya no escribe `itsmTicketId`), asi que ese indice viejo quedaba
        huerfano y rechazaba cualquier ticket nuevo despues del primero bajo
        el mismo meshId (`E11000 duplicate key ... itsmTicketId: null`,
        encontrado y corregido en el Mongo real el 2026-09-29 — ver HANDOFF.md
        seccion 17.10/17.13/17.15). Corregido aqui para que coincida con el
        `database-indexes.ts` real de TS, que ya usa `meshId_1_key_1`.
        """

        db = self.db
        itsm_tickets = db[self._settings.original_ticket_collection_name]
        tickets = db[self._settings.processed_ticket_collection_name]
        executions = db[self._settings.executions_collection_name]
        mappings = db[self._settings.mappings_collection_name]

        await itsm_tickets.create_index("status", name="status_1")
        await itsm_tickets.create_index("meshId", name="meshId_1")
        await tickets.create_index("meshId", name="meshId_1")

        duplicates_cursor = await tickets.aggregate(
            [
                {"$group": {"_id": {"meshId": "$meshId", "key": "$key"}, "count": {"$sum": 1}}},
                {"$match": {"count": {"$gt": 1}}},
            ]
        )
        duplicates = await duplicates_cursor.to_list()

        if duplicates:
            logger.warning(
                f"Skipping unique meshId+key index on tickets: {len(duplicates)} duplicates exist"
            )
        else:
            await tickets.create_index(
                [("meshId", 1), ("key", 1)],
                name="meshId_1_key_1",
                unique=True,
            )

        await executions.create_index("meshId", name="meshId_1")
        await mappings.create_index("meshId", name="meshId_1")
        await mappings.create_index(
            [("meshId", 1), ("sourceField", 1), ("targetField", 1)],
            name="meshId_1_sourceField_1_targetField_1",
            unique=True,
        )
