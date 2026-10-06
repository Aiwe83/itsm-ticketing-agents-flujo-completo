from __future__ import annotations

from dishka import FromDishka
from litestar import delete, get, post, put

from api.controllers.base import BaseController
from api.schemas.mcp import CreateMCPRequest, MCPResponse, UpdateMCPRequest
from models.common import DeleteResult
from services.mcp import MCPService


class MCPController(BaseController):
    path = "/mcps"
    tags = ["mcps"]

    @get(path="", operation_id="ListMCPs")
    async def list_mcps(
        self, mcp_service: FromDishka[MCPService]
    ) -> tuple[MCPResponse, ...]:
        result = await mcp_service.list_mcps()
        return tuple(MCPResponse.from_model(mcp) for mcp in result)

    @get(path="/{mcp_id:str}", operation_id="GetMCP")
    async def get_mcp(
        self, mcp_id: str, mcp_service: FromDishka[MCPService]
    ) -> MCPResponse:
        result = await mcp_service.get_mcp(mcp_id)
        return MCPResponse.from_model(result)

    @post(path="", operation_id="CreateMCP", status_code=201)
    async def create_mcp(
        self,
        data: CreateMCPRequest,
        mcp_service: FromDishka[MCPService],
    ) -> MCPResponse:
        result = await mcp_service.create_mcp(data)
        return MCPResponse.from_model(result)

    @put(path="/{mcp_id:str}", operation_id="UpdateMCP")
    async def update_mcp(
        self,
        mcp_id: str,
        data: UpdateMCPRequest,
        mcp_service: FromDishka[MCPService],
    ) -> MCPResponse:
        result = await mcp_service.update_mcp(mcp_id, data)
        return MCPResponse.from_model(result)

    @delete(path="/{mcp_id:str}", operation_id="DeleteMCP", status_code=200)
    async def delete_mcp(
        self, mcp_id: str, mcp_service: FromDishka[MCPService]
    ) -> DeleteResult:
        return await mcp_service.delete_mcp(mcp_id)

    @post(
        path="/{mcp_id:str}/refresh-catalog",
        operation_id="RefreshMCPDetails",
        status_code=200,
    )
    async def refresh_catalog(
        self,
        mcp_id: str,
        mcp_service: FromDishka[MCPService],
    ) -> MCPResponse:
        result = await mcp_service.refresh_catalog(mcp_id)
        return MCPResponse.from_model(result)
