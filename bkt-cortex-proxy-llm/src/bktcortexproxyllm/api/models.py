# src/bktcortexproxyllm/api/models.py

from enum import Enum
from typing import Any, Dict, List, Optional, Union
from uuid import uuid4
from pydantic import BaseModel, Field, field_validator


class Provider(str, Enum):
    """Supported LLM providers."""
    AZURE = "azure"


class MessageContent(BaseModel):
    """Model for message content."""
    role: str = Field(..., description="The role of the message sender")
    content: Optional[str] = Field(None, description="The content of the message")


class FunctionParameter(BaseModel):
    """Model for function parameters in tools."""
    type: str = Field(..., description="The type of the parameter")
    description: Optional[str] = Field(None, description="Description of the parameter")
    enum: Optional[List[str]] = Field(None, description="Possible values for the parameter")
    properties: Optional[Dict[str, Any]] = Field(None, description="Properties for object types")
    required: Optional[List[str]] = Field(None, description="Required properties")


class Function(BaseModel):
    """Model for function definition in tools."""
    name: str = Field(..., description="The name of the function")
    description: Optional[str] = Field(None, description="Description of the function")
    parameters: Optional[Dict[str, Any]] = Field(None, description="Parameters schema")


class Tool(BaseModel):
    """Model for tools."""
    type: str = Field("function", description="The type of the tool")
    function: Function = Field(..., description="The function definition")


class ResponseFormat(BaseModel):
    """Model for response format."""
    type: str = Field(..., description="The type of response format")
    json_schema: Optional[Dict[str, Any]] = Field(None, description="JSON schema for structured output")

class LLMRequest(BaseModel):
    """Base model for LLM requests with session management."""
    
    # LLM Configuration
    provider: Provider = Field(..., description="The LLM provider to use")
    model: str = Field(..., description="The model to use")
    messages: List[Any] = Field(..., description="The messages to send to the model")
    temperature: Optional[float] = Field(None, description="The temperature to use for generation")
    max_tokens: Optional[int] = Field(None, description="The maximum number of tokens to generate")
    top_p: Optional[float] = Field(None, description="The top_p value to use for generation")
    stop: Optional[Union[str, List[str]]] = Field(None, description="The stop sequence(s) to use")
    stream: Optional[bool] = Field(False, description="Whether to stream the response")
    tools: Optional[List[Tool]] = Field(None, description="The tools available to the model")
    response_format: Optional[ResponseFormat] = Field(None, description="The format for the response")
    
    # Session Management
    session_id: Optional[str] = Field(None, description="Session ID for conversation continuity")
    user_id: Optional[str] = Field("anonymous", description="User ID for personalized context")
    enable_memory: Optional[bool] = Field(True, description="Enable conversation memory")
    
    tenantId: Optional[str] = Field(None, description="Tenant ID")
    projectId: Optional[str] = Field(None, description="Project ID")
    itsmId: Optional[str] = Field(None, description="ITSM ID")
    itsmTicketId: Optional[str] = Field(None, description="Specific Ticket ID")
    agent_role: Optional[str] = Field(None, description="Role of the agent executing the action")

    @field_validator("stop")
    def validate_stop(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            return [v]
        return v
    
    @field_validator("session_id")
    def validate_session_id(cls, v):
        if v is None or v.strip() == "":
            return str(uuid4())
        return v.strip()
    
    class Config:
        extra = "allow"
        json_schema_extra = {
            "example": {
                "provider": "azure",
                "model": "gpt-4o",
                "messages": [
                    {"role": "system", "content": "Eres un agente orquestador..."},
                    {"role": "user", "content": '{"itsmTicketId": "I2025_057275", "agent_rol": "agentic-orchestrator-application", "statusSp": "Cerrado"}'}
                ],
                "temperature": 0.7,
                "stream": False
            }
        }


class ParametersFormat(BaseModel):
    """Model for extra parameters."""
    return_tokens: bool = Field(..., description="Return tokens in the response")


class TokenizerRequest(BaseModel):
    """Base model for Tokenizer requests."""
    provider: Provider = Field(..., description="The LLM provider to use")
    model: str = Field(..., description="The model to use")
    input: str = Field(..., description="The text to tokenize")
    parameters: Optional[ParametersFormat] = Field(None, description="Extra parameters")