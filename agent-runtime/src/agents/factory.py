from __future__ import annotations

from collections.abc import Sequence
from typing import cast

from langchain_core.tools import BaseTool

from agents.base import BaseAgent, StateT
from core.settings import AgentRuntimeSettings
from mcp_integration.client import MCPClient
from models.agent import BaseAgentState
from providers.base import Provider


class BaseAgentFactory:
    """Factory para construir runtimes de agente con dependencias resueltas por DI."""

    def __init__(
        self,
        internal_tools: tuple[BaseTool, ...],
        mcp_client: MCPClient,
        runtime_settings: AgentRuntimeSettings,
    ) -> None:
        """Inicializa la factory con las tools internas compartidas y el cliente MCP."""
        self._internal_tools = internal_tools
        self._mcp_client = mcp_client
        self._runtime_settings = runtime_settings

    def build(
        self,
        *,
        provider: Provider,
        tools: Sequence[BaseTool] | None = None,
        state_schema: type[StateT] | None = None,
    ) -> BaseAgent[StateT]:
        """Construye un `BaseAgent` usando las tools explícitas o, si no se pasan, las internas por defecto."""
        runtime_tools = list(tools) if tools is not None else list(self._internal_tools)
        return BaseAgent(
            provider=provider,
            tools=runtime_tools,
            state_schema=state_schema
            if state_schema is not None
            else cast(type[StateT], BaseAgentState),
            mcp_client=self._mcp_client,
            runtime_settings=self._runtime_settings,
        )

    def get_internal_tools(self) -> tuple[BaseTool, ...]:
        """Devuelve las tools internas compartidas registradas en el contenedor."""
        return self._internal_tools
