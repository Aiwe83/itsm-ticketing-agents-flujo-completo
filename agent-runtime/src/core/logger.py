from __future__ import annotations

import logging
import sys
import uuid
from collections.abc import Callable
from contextvars import ContextVar, Token
from typing import TYPE_CHECKING, Any

from loguru import logger

from core.settings import AppSettings

_otel_trace: Any | None = None
try:
    from opentelemetry import trace as _otel_trace

    _OTEL_AVAILABLE = True
except ImportError:
    _OTEL_AVAILABLE = False

if TYPE_CHECKING:
    from loguru import Logger as LoguruLogger
    from loguru import Message, Record
    from opentelemetry.sdk._logs import LoggerProvider


_request_id_context: ContextVar[str | None] = ContextVar("request_id", default=None)


class InterceptHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        logger.bind(logger_name=record.name).opt(exception=record.exc_info).log(
            level,
            record.getMessage(),
        )


def _patch_record(record: Record) -> None:
    record["extra"].setdefault("request_id", get_request_id() or "-")
    record["extra"].setdefault("trace_id", "-")
    record["extra"].setdefault("span_id", "-")
    record["extra"].setdefault("http_context", "")
    record["extra"]["safe_message"] = str(record["message"]).replace("{", "{{").replace("}", "}}")

    method = record["extra"].get("method")
    path = record["extra"].get("path")
    status_code = record["extra"].get("status_code")
    duration_ms = record["extra"].get("duration_ms")
    if method and path and status_code is not None and duration_ms is not None:
        record["extra"]["http_context"] = (
            f"{method} {path} | status={status_code} duration_ms={duration_ms} | "
        )

    if _OTEL_AVAILABLE and _otel_trace is not None:
        span_ctx = _otel_trace.get_current_span().get_span_context()
        if span_ctx.is_valid:
            record["extra"]["trace_id"] = format(span_ctx.trace_id, "032x")
            record["extra"]["span_id"] = format(span_ctx.span_id, "016x")


def _make_otel_log_sink(logger_provider: LoggerProvider) -> Callable[[Message], None]:
    from opentelemetry._logs import SeverityNumber
    from opentelemetry._logs._internal import LogRecord as SdkLogRecord

    _SEVERITY: dict[str, SeverityNumber] = {
        "TRACE": SeverityNumber.TRACE,
        "DEBUG": SeverityNumber.DEBUG,
        "INFO": SeverityNumber.INFO,
        "SUCCESS": SeverityNumber.INFO2,
        "WARNING": SeverityNumber.WARN,
        "ERROR": SeverityNumber.ERROR,
        "CRITICAL": SeverityNumber.FATAL,
    }

    otel_logger = logger_provider.get_logger("app")  # type: ignore[union-attr]

    def sink(message: Message) -> None:
        record = message.record
        severity = _SEVERITY.get(record["level"].name, SeverityNumber.UNSPECIFIED)

        trace_id = None
        span_id = None
        trace_flags = None
        if _OTEL_AVAILABLE and _otel_trace is not None:
            span_ctx = _otel_trace.get_current_span().get_span_context()
            if span_ctx.is_valid:
                trace_id = span_ctx.trace_id
                span_id = span_ctx.span_id
                trace_flags = span_ctx.trace_flags

        attributes = {
            "code.filepath": record["file"].path,
            "code.function": record["function"],
            "code.lineno": record["line"],
            "request_id": record["extra"].get("request_id", "-"),
        }

        for key in ("method", "path", "status_code", "duration_ms"):
            value = record["extra"].get(key)
            if value is not None:
                attributes[key] = value

        otel_logger.emit(
            SdkLogRecord(
                timestamp=int(record["time"].timestamp() * 1_000_000_000),
                trace_id=trace_id,
                span_id=span_id,
                trace_flags=trace_flags,
                severity_number=severity,
                severity_text=record["level"].name,
                body=record["message"],
                attributes=attributes,
            )
        )

    return sink


_PRETTY_FORMAT = (
    "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
    "<level>{level:<8}</level> | "
    "<cyan>{extra[request_id]}</cyan> | "
    "<dim>{extra[trace_id]}</dim> | "
    "{extra[http_context]}"
    "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan>"
    " - <level>{extra[safe_message]}</level>"
)


def configure_logging(settings: AppSettings) -> None:
    logger.remove()
    logger.configure(patcher=_patch_record)
    logger.add(
        sys.stdout,
        level=settings.logging.level,
        serialize=settings.logging.json_logs,
        colorize=not settings.logging.json_logs,
        enqueue=False,
        format=_PRETTY_FORMAT if not settings.logging.json_logs else "{message}",
    )

    logging.basicConfig(handlers=[InterceptHandler()], level=getattr(logging, settings.logging.level))
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "httpx"):
        noisy = logging.getLogger(name)
        noisy.handlers = [InterceptHandler()]
        noisy.propagate = False


def add_otel_log_sink(settings: AppSettings) -> None:
    """Reserved for OTEL log export integration."""
    del settings


def bind_request_id(request_id: str | None = None) -> tuple[str, Token[str | None]]:
    resolved = request_id or str(uuid.uuid4())
    token = _request_id_context.set(resolved)
    return resolved, token


def reset_request_id(token: Token[str | None]) -> None:
    _request_id_context.reset(token)


def get_request_id() -> str | None:
    return _request_id_context.get()


def get_logger() -> LoguruLogger:
    return logger
