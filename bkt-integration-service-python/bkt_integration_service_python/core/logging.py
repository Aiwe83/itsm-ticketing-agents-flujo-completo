"""Logging con loguru, equivalente a src/config/logger.ts (Pino)."""

from __future__ import annotations

import sys

from loguru import logger

from bkt_integration_service_python.core.config import Settings


def configure_logging(settings: Settings) -> None:
    # La consola de Windows suele quedar en cp1252: forzar UTF-8 evita que un
    # simple log con un caracter no-ASCII (o el icono de nivel de loguru)
    # tumbe el logging con UnicodeEncodeError.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

    logger.remove()
    logger.add(
        sys.stdout,
        level=settings.log_level.upper(),
        colorize=settings.log_pretty_print,
        serialize=not settings.log_pretty_print,
    )


__all__ = ["logger", "configure_logging"]
