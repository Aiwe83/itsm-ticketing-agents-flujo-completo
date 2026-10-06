from __future__ import annotations

from core.errors.base import ApplicationError


class AgentError(ApplicationError):
    """Error base del dominio de agentes sobre el que se construyen los demás tipos."""

    code = "agent_error"
    message = "Error ejecutando el agente"


class AgentInvalidPayloadError(AgentError):
    """Se lanza cuando el payload de entrada del agente es inválido o incompleto."""

    status_code = 400
    code = "agent_invalid_payload_error"


class AgentRuntimeStateError(AgentError):
    """Indica que el estado interno del runtime del agente es inconsistente o no válido."""

    status_code = 500
    code = "agent_runtime_state_error"
    message = "Agent runtime state is invalid."


class AgentStreamContractError(AgentError):
    """Representa una violación del contrato esperado para los eventos de streaming."""

    status_code = 500
    code = "agent_stream_contract_error"
    message = "Agent stream payload does not match the expected contract."


class AgentToolCallContractError(AgentError):
    """Se usa cuando una tool call no cumple el contrato de datos definido por el sistema."""

    status_code = 500
    code = "agent_tool_call_contract_error"
    message = "Tool call payload does not match the expected contract."


class AgentReservedStateKeyError(AgentInvalidPayloadError):
    """Se produce cuando `extra_state` incluye claves reservadas del estado base del agente."""

    code = "agent_reserved_state_key_error"
    message = "extra_state contains reserved BaseAgent state keys."


class AgentUnhandledStreamError(AgentError):
    """Agrupa errores inesperados durante la emisión de eventos en streaming del agente."""

    status_code = 500
    code = "agent_unhandled_stream_error"
    message = "Unhandled error while streaming agent events."


class AgentToolExecutionError(AgentError):
    """Identifica fallos durante la ejecución de una herramienta del agente."""

    status_code = 500
    code = "agent_tool_execution_error"
    message = "Tool execution failed."


class AgentToolArgsJSONError(AgentToolCallContractError):
    """Se lanza cuando los argumentos de una tool call contienen JSON mal formado."""

    code = "agent_tool_args_json_error"
    message = "Tool arguments contain invalid JSON."


class AgentToolArgsTypeError(AgentToolCallContractError):
    """Se lanza cuando el tipo de argumentos de la tool call no es un objeto ni JSON válido."""

    code = "agent_tool_args_type_error"
    message = "Tool arguments must be an object or JSON string."


class AgentStreamEventValidationError(AgentStreamContractError):
    """Se usa para eventos `response.*` que no pasan la validación estructural esperada."""

    code = "agent_stream_event_validation_error"
    message = "Response stream event failed validation."
