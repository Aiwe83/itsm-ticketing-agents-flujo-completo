from __future__ import annotations

from typing import TYPE_CHECKING

from dishka import FromDishka
from litestar import delete, get, post, put
from litestar.enums import MediaType
from litestar.response import Response, ServerSentEvent
from litestar.response.sse import ServerSentEventMessage
from msgspec import json as msgspec_json

from api.controllers.base import BaseController
from api.schemas.agent import AgentResponse, CreateAgentRequest, UpdateAgentRequest
from api.schemas.chat import ConfiguredAgentChatRequest
from models.common import DeleteResult
from models.openai_compatible.responses.output import ResponsesResponsePayload
from services.agent import AgentService
from services.chat import ChatService

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Sequence


class AgentController(BaseController):
    path: str = "/agents"
    tags: Sequence[str] | None = ("agents",)

    @get(path="", operation_id="ListAgents", summary="List agents")
    async def list_agents(
        self, agent_service: FromDishka[AgentService]
    ) -> tuple[AgentResponse, ...]:
        result = await agent_service.list_agents()
        return tuple(AgentResponse.from_model(agent) for agent in result)

    @get(
        path="/{agent_id:str}",
        operation_id="GetAgent",
        summary="Get agent",
    )
    async def get_agent(
        self, agent_id: str, agent_service: FromDishka[AgentService]
    ) -> AgentResponse:
        result = await agent_service.get_agent(agent_id)
        return AgentResponse.from_model(result)

    @post(
        path="",
        operation_id="CreateAgent",
        status_code=201,
        summary="Create agent",
    )
    async def create_agent(
        self,
        data: CreateAgentRequest,
        agent_service: FromDishka[AgentService],
    ) -> AgentResponse:
        result = await agent_service.create_agent(data)
        return AgentResponse.from_model(result)

    @put(
        path="/{agent_id:str}",
        operation_id="UpdateAgent",
        summary="Update agent",
    )
    async def update_agent(
        self,
        agent_id: str,
        data: UpdateAgentRequest,
        agent_service: FromDishka[AgentService],
    ) -> AgentResponse:
        result = await agent_service.update_agent(agent_id, data)
        return AgentResponse.from_model(result)

    @delete(
        path="/{agent_id:str}",
        operation_id="DeleteAgent",
        status_code=200,
        summary="Delete agent",
    )
    async def delete_agent(
        self, agent_id: str, agent_service: FromDishka[AgentService]
    ) -> DeleteResult:
        return await agent_service.delete_agent(agent_id)

    @put(
        path="/{agent_id:str}/mcps/{mcp_id:str}",
        operation_id="AddAgentMCP",
        summary="Add MCP to agent",
    )
    async def add_mcp_to_agent(
        self,
        agent_id: str,
        mcp_id: str,
        agent_service: FromDishka[AgentService],
    ) -> AgentResponse:
        result = await agent_service.add_mcp_to_agent(agent_id, mcp_id)
        return AgentResponse.from_model(result)

    @delete(
        path="/{agent_id:str}/mcps/{mcp_id:str}",
        operation_id="RemoveAgentMCP",
        status_code=200,
        summary="Remove MCP from agent",
    )
    async def remove_mcp_from_agent(
        self,
        agent_id: str,
        mcp_id: str,
        agent_service: FromDishka[AgentService],
    ) -> AgentResponse:
        result = await agent_service.remove_mcp_from_agent(agent_id, mcp_id)
        return AgentResponse.from_model(result)


class AgentChatController(BaseController):
    path: str = "/agents"
    tags: Sequence[str] | None = ("agents", "chat")

    @post(
        path="/{agent_id:str}/chat",
        operation_id="ChatWithAgent",
        status_code=200,
        summary="Chat with agent",
        description="Runs a configured agent and returns either a JSON response or an SSE stream.",
    )
    async def chat_with_agent(
        self,
        agent_id: str,
        data: ConfiguredAgentChatRequest,
        chat_service: FromDishka[ChatService],
    ) -> ServerSentEvent | Response[ResponsesResponsePayload]:
        if not data.stream:
            return Response(
                content=await chat_service.chat_with_agent_response(agent_id, data),
                media_type=MediaType.JSON,
            )

        async def stream() -> AsyncIterator[ServerSentEventMessage]:
            async for event in chat_service.chat_with_agent(agent_id, data):
                event_type = event.get("type")
                yield ServerSentEventMessage(
                    event=event_type,
                    data=msgspec_json.encode(event).decode(),
                )

        return ServerSentEvent(stream())
