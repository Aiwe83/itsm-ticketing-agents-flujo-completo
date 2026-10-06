"""Proveedores Dishka: config, cliente Mongo, repositorios, servicios."""

from __future__ import annotations

from collections.abc import AsyncIterator

from dishka import Provider, Scope, make_async_container, provide
from pymongo.asynchronous.database import AsyncDatabase

from bkt_integration_service_python.clients.agent_runtime_client import AgentRuntimeClient
from bkt_integration_service_python.core.config import Settings, get_settings
from bkt_integration_service_python.repositories.mongo.connection import MongoConnection
from bkt_integration_service_python.repositories.mongo.execution_repository import ExecutionRepository
from bkt_integration_service_python.repositories.mongo.itsm_ticket_repository import ITSMTicketRepository
from bkt_integration_service_python.repositories.mongo.mapping_repository import MappingRepository
from bkt_integration_service_python.repositories.mongo.ticket_repository import TicketRepository
from bkt_integration_service_python.services.attachment_service import AttachmentService
from bkt_integration_service_python.services.issue_service import IssueService
from bkt_integration_service_python.services.jira_attachment_fetcher import create_jira_attachment_fetcher


class AppProvider(Provider):
    scope = Scope.APP

    @provide
    def settings(self) -> Settings:
        return get_settings()

    @provide
    async def mongo_connection(self, settings: Settings) -> AsyncIterator[MongoConnection]:
        connection = MongoConnection(settings)
        await connection.connect()
        try:
            yield connection
        finally:
            await connection.disconnect()

    @provide
    def db(self, mongo: MongoConnection) -> AsyncDatabase:
        return mongo.db

    @provide
    def execution_repository(self, db: AsyncDatabase, settings: Settings) -> ExecutionRepository:
        return ExecutionRepository(db, settings)

    @provide
    def itsm_ticket_repository(self, db: AsyncDatabase, settings: Settings) -> ITSMTicketRepository:
        return ITSMTicketRepository(db, settings)

    @provide
    def ticket_repository(self, db: AsyncDatabase, settings: Settings) -> TicketRepository:
        return TicketRepository(db, settings)

    @provide
    def mapping_repository(self, db: AsyncDatabase, settings: Settings) -> MappingRepository:
        return MappingRepository(db, settings)

    @provide
    def agent_runtime_client(self, settings: Settings) -> AgentRuntimeClient:
        return AgentRuntimeClient(settings)

    @provide
    def attachment_service(self, settings: Settings) -> AttachmentService:
        fetcher = create_jira_attachment_fetcher(
            jira_base_url=settings.jira_base_url,
            jira_user=settings.jira_user,
            jira_password=settings.jira_password,
            attachment_bytes_limit=settings.attachment_bytes_limit,
        )
        return AttachmentService(fetcher=fetcher, bytes_limit=settings.attachment_bytes_limit)

    @provide
    def issue_service(
        self,
        settings: Settings,
        mappings_repo: MappingRepository,
        itsm_tickets_repo: ITSMTicketRepository,
        executions_repo: ExecutionRepository,
        tickets_repo: TicketRepository,
        orchestrator_client: AgentRuntimeClient,
        attachment_service: AttachmentService,
    ) -> IssueService:
        return IssueService(
            settings,
            mappings_repo,
            itsm_tickets_repo,
            executions_repo,
            tickets_repo,
            orchestrator_client,
            attachment_service,
        )


def build_container():
    return make_async_container(AppProvider())
