"""API router configuration."""
from fastapi import APIRouter

from src.bktcortexproxyllm.api.endpoints import proxy

api_router = APIRouter()

# Include the proxy router with a prefix
api_router.include_router(proxy.router, prefix="/llm", tags=["LLM Proxy"])
