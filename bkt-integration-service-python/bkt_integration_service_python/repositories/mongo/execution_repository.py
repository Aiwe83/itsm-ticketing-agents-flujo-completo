"""Equivalente a src/repositories/execution.repository.ts."""

from __future__ import annotations

import uuid
from datetime import datetime

from pymongo.asynchronous.database import AsyncDatabase

from bkt_integration_service_python.core.config import Settings
from bkt_integration_service_python.domain.execution import ExecutionError, ExecutionTicket, OrchestratorResponseTrace


class ExecutionRepository:
    def __init__(self, db: AsyncDatabase, settings: Settings) -> None:
        self._collection = db[settings.executions_collection_name]
        self._mesh_id = settings.mesh_id

    async def create_execution(self, *, initiated_by: str, start_time: datetime) -> str:
        execution_id = str(uuid.uuid4())
        await self._collection.insert_one(
            {
                "_id": execution_id,
                "meshId": self._mesh_id,
                "initiatedBy": initiated_by,
                "successIntegration": False,
                "successOrchestrator": False,
                "error": [],
                "startTime": start_time,
                "executionTime": 0,
                "ticketsProcessed": 0,
                "ticketsSucceeded": 0,
                "ticketsFailed": 0,
                "ticketList": [],
                "createdAt": datetime.now(start_time.tzinfo),
                "updatedAt": datetime.now(start_time.tzinfo),
            }
        )
        return execution_id

    async def update_integration_status(self, execution_id: str, success: bool) -> None:
        await self._collection.update_one({"_id": execution_id}, {"$set": {"successIntegration": success}})

    async def update_orchestrator_status(self, execution_id: str, success: bool) -> None:
        await self._collection.update_one({"_id": execution_id}, {"$set": {"successOrchestrator": success}})

    async def add_error(self, execution_id: str, error: ExecutionError) -> None:
        await self._collection.update_one({"_id": execution_id}, {"$push": {"error": error.to_dict()}})

    async def add_ticket(self, execution_id: str, ticket: ExecutionTicket) -> None:
        await self._collection.update_one({"_id": execution_id}, {"$push": {"ticketList": ticket.to_dict()}})

    async def append_ticket_error(self, execution_id: str, transformed_ticket_id: str, error: ExecutionError) -> None:
        await self._collection.update_one(
            {"_id": execution_id, "ticketList.transformedTicketId": transformed_ticket_id},
            {
                "$push": {"ticketList.$.errorList": error.to_dict()},
                "$set": {"ticketList.$.success": False},
            },
        )

    async def complete_execution(
        self,
        execution_id: str,
        *,
        end_time: datetime,
        execution_time: int,
        tickets_processed: int,
        tickets_succeeded: int,
        tickets_failed: int,
    ) -> None:
        await self._collection.update_one(
            {"_id": execution_id},
            {
                "$set": {
                    "endTime": end_time,
                    "executionTime": execution_time,
                    "ticketsProcessed": tickets_processed,
                    "ticketsSucceeded": tickets_succeeded,
                    "ticketsFailed": tickets_failed,
                }
            },
        )

    async def set_dispatched_execution_ids(self, execution_id: str, execution_ids: list[str]) -> None:
        await self._collection.update_one(
            {"_id": execution_id}, {"$set": {"dispatchedExecutionIds": execution_ids}}
        )

    async def set_orchestrator_responses(
        self, execution_id: str, responses: list[OrchestratorResponseTrace]
    ) -> None:
        await self._collection.update_one(
            {"_id": execution_id},
            {"$set": {"orchestratorResponses": [r.to_dict() for r in responses]}},
        )
