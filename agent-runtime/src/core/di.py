from __future__ import annotations

from collections.abc import AsyncIterator

from dishka import AsyncContainer, Provider, Scope, make_async_container, provide
from dishka.integrations.litestar import LitestarProvider
from langchain_core.tools import BaseTool

from agents.factory import BaseAgentFactory
from core.clients import MongoDBClient, RedisClient
from core.settings import AppSettings
from mcp_integration.client import MCPClient
from repositories.health import HealthRepository
from repositories.mongodb.agent import AgentRepository
from repositories.mongodb.mcp import MCPServerRepository
from repositories.mongodb.model import ModelRepository
from repositories.mongodb.provider import ProviderRepository
from services.agent import AgentService
from services.chat import ChatService
from services.health import HealthService
from services.mcp import MCPService
from services.orchestrator import OrchestratorDispatchService
from services.provider import ProviderService
from tools.registry import build_internal_tools

class ApplicationProvider(Provider):
    scope = Scope.APP

    def __init__(self, settings: AppSettings) -> None:
        super().__init__(scope=Scope.APP)
        self._settings = settings

    @provide
    def provide_settings(self) -> AppSettings:
        return self._settings

    @provide
    async def provide_mongodb_client(
        self, settings: AppSettings
    ) -> AsyncIterator[MongoDBClient]:
        client = MongoDBClient(settings.mongodb)
        try:
            yield client
        finally:
            await client.aclose()

    @provide
    async def provide_redis_client(
        self, settings: AppSettings
    ) -> AsyncIterator[RedisClient]:
        client = RedisClient(settings.redis)
        try:
            yield client
        finally:
            await client.aclose()

    @provide
    def provide_health_repository(
        self,
        mongodb_client: MongoDBClient,
        redis_client: RedisClient,
    ) -> HealthRepository:
        return HealthRepository((mongodb_client, redis_client))

    @provide
    def provide_mcp_client(self, settings: AppSettings) -> MCPClient:
        return MCPClient(settings.auth.encryption_key or "")

    agent_repository = provide(AgentRepository)
    mcp_repository = provide(MCPServerRepository)
    model_repository = provide(ModelRepository)
    provider_repository = provide(ProviderRepository)

    @provide
    def provide_internal_tools(self) -> tuple[BaseTool, ...]:
        return build_internal_tools()

    @provide
    def provide_base_agent_factory(
        self,
        internal_tools: tuple[BaseTool, ...],
        mcp_client: MCPClient,
        settings: AppSettings,
    ) -> BaseAgentFactory:
        return BaseAgentFactory(
            internal_tools=internal_tools,
            mcp_client=mcp_client,
            runtime_settings=settings.agent_runtime,
        )

    health_service = provide(HealthService)

    @provide(scope=Scope.REQUEST)
    def provide_mcp_service(
        self,
        mcp_repository: MCPServerRepository,
        mcp_client: MCPClient,
    ) -> MCPService:
        return MCPService(mcp_repository, mcp_client)

    @provide(scope=Scope.REQUEST)
    def provide_provider_service(
        self,
        provider_repository: ProviderRepository,
        model_repository: ModelRepository,
    ) -> ProviderService:
        return ProviderService(provider_repository, model_repository)

    @provide
    def provide_agent_service(
        self,
        agent_repository: AgentRepository,
        mcp_repository: MCPServerRepository,
    ) -> AgentService:
        return AgentService(agent_repository, mcp_repository)

    @provide(scope=Scope.REQUEST)
    def provide_chat_service(
        self,
        agent_repository: AgentRepository,
        mcp_repository: MCPServerRepository,
        base_agent_factory: BaseAgentFactory,
    ) -> ChatService:
        return ChatService(
            settings=self._settings,
            agent_repository=agent_repository,
            mcp_repository=mcp_repository,
            base_agent_factory=base_agent_factory,
        )

    @provide(scope=Scope.REQUEST)
    def provide_orchestrator_dispatch_service(
        self,
        agent_repository: AgentRepository,
        model_repository: ModelRepository,
        chat_service: ChatService,
    ) -> OrchestratorDispatchService:
        return OrchestratorDispatchService(
            settings=self._settings,
            agent_repository=agent_repository,
            model_repository=model_repository,
            chat_service=chat_service,
        )


def build_async_container(settings: AppSettings) -> AsyncContainer:
    return make_async_container(
        ApplicationProvider(settings),
        LitestarProvider(),
    )
