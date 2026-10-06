from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from core.settings import AppSettings

_tracer_provider: Any | None = None


def _build_resource(settings: AppSettings) -> Any:
    from opentelemetry.sdk.resources import (
        SERVICE_NAME,
        SERVICE_VERSION,
        Resource,
    )

    return Resource.create(
        {
            SERVICE_NAME: settings.observability.service_name or settings.app_name,
            SERVICE_VERSION: settings.app_version,
            "deployment.environment": settings.environment,
        }
    )


def configure_telemetry(settings: AppSettings) -> None:
    global _tracer_provider

    if _tracer_provider is not None:
        return

    from openinference.instrumentation.langchain import LangChainInstrumentor
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    endpoint = settings.observability.otlp_endpoint.rstrip("/")
    resource = _build_resource(settings)

    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces"))
    )
    _tracer_provider = tracer_provider
    trace.set_tracer_provider(tracer_provider)
    HTTPXClientInstrumentor().instrument()
    LangChainInstrumentor().instrument()


def shutdown_telemetry() -> None:
    global _tracer_provider

    if _tracer_provider is not None:
        _tracer_provider.shutdown()
        _tracer_provider = None
