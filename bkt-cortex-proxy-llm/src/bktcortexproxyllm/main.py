"""Main FastAPI application (Arize Phoenix ready)."""
from src.bktcortexproxyllm.logging_config import configure_logging
configure_logging()

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from fastapi.openapi.utils import get_openapi
import uvicorn

from src.bktcortexproxyllm.core.config import settings
from src.bktcortexproxyllm.api.router import api_router

logger = logging.getLogger("src.bktcortexproxyllm.main")

_OBS_INIT_DONE = False  # guard para recargas (uvicorn --reload)


class TraceStatusMiddleware(BaseHTTPMiddleware):
    """Middleware to set trace status based on HTTP response status."""
    async def dispatch(self, request, call_next):
        span = trace.get_current_span()
        try:
            response = await call_next(request)
            if span and span.is_recording():
                if 200 <= response.status_code < 400:
                    span.set_status(Status(StatusCode.OK))
                else:
                    span.set_status(Status(StatusCode.ERROR))
            return response
        except Exception as e:
            if span and span.is_recording():
                span.set_status(Status(StatusCode.ERROR, str(e)))
            raise


def _init_observability() -> None:
    """
    Inicializa Arize Phoenix usando SIEMPRE OTLP gRPC a puerto 4317.
    Sin detecciones ni paths; solo gRPC.
    """
    global _OBS_INIT_DONE
    if _OBS_INIT_DONE:
        return

    endpoint = (getattr(settings, "PHOENIX_COLLECTOR_ENDPOINT", "") or "").strip()
    if not endpoint:
        endpoint = "phoenix:4317"

    try:
        from phoenix.otel import register as phoenix_register

        headers = None
        api_key = getattr(settings, "PHOENIX_API_KEY", None)
        if api_key:
            headers = {"Authorization": f"Bearer {api_key}"}

        phoenix_register(
            project_name=getattr(settings, "PHOENIX_PROJECT_NAME", settings.PROJECT_NAME),
            endpoint=endpoint,
            protocol="grpc",
            auto_instrument=True,
            headers=headers,
            batch=True,
        )

        # Instrumentación OpenAI explícita
        try:
            from opentelemetry.instrumentation.openai import OpenAIInstrumentor
            OpenAIInstrumentor().instrument()
            logger.info("✅ OpenAI instrumentation aplicada")
        except ImportError:
            logger.warning("⚠️ opentelemetry-instrumentation-openai no instalado")
        except Exception as e:
            logger.error("❌ OpenAI instrumentation falló: %s", e)

        logger.info("Phoenix inicializado: protocol=gRPC endpoint=%s", endpoint)

    except Exception as e:
        logger.warning("Phoenix no inicializado (gRPC 4317): %s", e)

    _OBS_INIT_DONE = True


# ==============================================================================
# Ciclo de vida
# ==============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown."""
    logger.info("🚀 Starting LLM Interface...")
    yield
    logger.info("🛑 Shutting down LLM Interface...")


def create_app() -> FastAPI:
    """Factory de aplicación FastAPI con configuración completa."""
    # Observabilidad debe empezar cuanto antes
    _init_observability()

    openapi_url = f"{settings.API_V1_STR}/{settings.OPENAPI_URL}"
    docs_url = f"{settings.API_V1_STR}/docs"
    redoc_url = f"{settings.API_V1_STR}/redoc"

    app = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url=openapi_url if settings.DEBUG else None,
        docs_url=docs_url if settings.DEBUG else None,
        redoc_url=redoc_url if settings.DEBUG else None,
        response_model_exclude_unset=True,
        lifespan=lifespan,
    )

    configure_middlewares(app)
    configure_openinference_middleware(app)
    app.include_router(api_router, prefix=settings.API_V1_STR)
    configure_openapi(app)

    return app


# ==============================================================================
# Configuración
# ==============================================================================

def configure_middlewares(app: FastAPI):
    """Configuración de middlewares."""
    app.add_middleware(TraceStatusMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=getattr(settings, "CORS_ORIGINS", ["*"]),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def configure_openinference_middleware(app: FastAPI):
    """
    Middleware ligero para anotar spans como 'chain' y añadir session_id.
    """
    from starlette.middleware.base import BaseHTTPMiddleware
    from opentelemetry import trace
    from openinference.semconv.trace import SpanAttributes
    import uuid

    class OpenInferenceMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            # 🔥 GENERAR SIEMPRE session_id, con o sin span
            session_id = request.headers.get("X-Session-ID") or str(uuid.uuid4())
            
            # Guardar en request.state SIEMPRE
            request.state.session_id = session_id
            logger.info(f"🔑 Middleware generó session_id: {session_id}")
            
            # Si hay span, setearlo (pero no depender de esto)
            span = trace.get_current_span()
            if span and span.is_recording():
                span.set_attribute(SpanAttributes.OPENINFERENCE_SPAN_KIND, "chain")
                span.set_attribute(SpanAttributes.SESSION_ID, session_id)
                logger.info(f"✅ Session_id seteado en span del middleware")
            else:
                logger.warning("⚠️ No hay span en middleware, pero session_id guardado en request.state")
                
            response = await call_next(request)
            return response

    app.add_middleware(OpenInferenceMiddleware)


def configure_openapi(app: FastAPI):
    """Personalización de OpenAPI."""
    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema

        openapi_schema = get_openapi(
            title=settings.PROJECT_NAME,
            version="1.0.0",
            description="LLM Interface API documentation",
            routes=app.routes,
        )
        app.openapi_schema = openapi_schema
        return app.openapi_schema

    app.openapi = custom_openapi


# ==============================================================================
# App + endpoints básicos
# ==============================================================================

app = create_app()


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "message": "LLM Interface is running."}


# ==============================================================================
# Entry point (solo desarrollo local)
# ==============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "src.bktcortexproxyllm.main:app",
        host="0.0.0.0",
        port=8010,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )