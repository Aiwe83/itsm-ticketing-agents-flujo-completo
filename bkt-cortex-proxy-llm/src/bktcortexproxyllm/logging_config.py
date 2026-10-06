"""
logging_config.py
────────────────────────────────────────────────────────────────────────
- Salida JSON ECS para consola (stdout).
- Añade origen del caller (file, func, line) automáticamente.
- Extrae pares key=value presentes en `message` y los convierte en campos.
- Evita que el JSON completo quede incrustado dentro de `message`.
- Sin OpenTelemetry (OTLP) ni Langfuse/Redis.
"""

from __future__ import annotations

import datetime as _dt
import json
import logging
import logging.config
import os
import re
import sys
import inspect
from pathlib import Path
from types import FrameType
from typing import Tuple

from pythonjsonlogger import jsonlogger
from src.bktcortexproxyllm.core.config import settings

# ⭐ Guard para evitar configuración múltiple
_LOGGING_CONFIGURED = False

# ──────────────────────────────────────────────────────────────────────
# 1) Variables de servicio / entorno
# ---------------------------------------------------------------------
SERVICE_NAME = settings.PROJECT_NAME.lower()
ENVIRONMENT  = (getattr(settings, "ENVIRONMENT", "dev") or "dev").lower()

# Intento razonable de "root" del proyecto (no crítico)
THIS_FILE = Path(__file__).resolve()
BASE_DIR  = THIS_FILE.parent  # carpeta del archivo; ajusta si quieres subir niveles

# ──────────────────────────────────────────────────────────────────────
# 2) LogRecordFactory para campos ECS + caller info
# ---------------------------------------------------------------------
_OLD_FACTORY = logging.getLogRecordFactory()
_KV_RE = re.compile(r"\b(\w+)\s*=\s*([^,\s]+)")  # clave=valor (simple)

def _find_caller() -> Tuple[str, str, int]:
    """Primer frame que pertenece a tu código (evitando este archivo)."""
    frame: FrameType | None = inspect.currentframe()
    while frame:
        frame = frame.f_back
        if not frame:
            break
        fpath = Path(frame.f_code.co_filename).resolve()
        if fpath == THIS_FILE:
            continue
        # Heurística: si el path comparte directorio con este módulo, lo tomamos
        if str(BASE_DIR) in str(fpath):
            return str(fpath), frame.f_code.co_name, frame.f_lineno
    return "", "", 0

def _ecs_record_factory(*args, **kwargs) -> logging.LogRecord:
    record = _OLD_FACTORY(*args, **kwargs)

    # Origen
    file_path, func_name, line_no = _find_caller()
    record.origin_file_path = file_path
    record.origin_func = func_name
    record.origin_line = line_no

    # Campos fijos ECS
    record.ecs_version = "1.6.0"
    record.service_name = SERVICE_NAME
    record.dataset = "src.logs"
    record.env = ENVIRONMENT
    record.ts_iso = (
        _dt.datetime.now(tz=_dt.timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    return record

# ⭐ Solo setear factory una vez
if not _LOGGING_CONFIGURED:
    logging.setLogRecordFactory(_ecs_record_factory)

# ──────────────────────────────────────────────────────────────────────
# 3) Formatter JSON (extrae key=value + evita JSON doble en message)
# ---------------------------------------------------------------------
class EcsJsonFormatter(jsonlogger.JsonFormatter):
    """Formatter ECS sin duplicación de message."""
    
    def process_log_record(self, log_record):
        # No devolver json.dumps(dict); dejamos que el handler serialice una sola vez.
        return log_record

    def add_fields(self, log_record: dict, record: logging.LogRecord, _: dict):
        super().add_fields(log_record, record, _)

        # 🔥 SOLO extraer k=v si el mensaje es corto (evitar JSON grandes)
        msg_text = record.getMessage()
        if len(msg_text) < 500:  # Solo si es mensaje corto
            for k, v in _KV_RE.findall(msg_text):
                if k not in log_record:
                    log_record[k] = int(v) if v.isdigit() else v

        # Campos ECS base
        log_record.update(
            {
                "@timestamp": record.ts_iso,
                "log.level": record.levelname.lower(),
                "message": msg_text,  # Solo message, no msg
                "ecs.version": record.ecs_version,
                "service.name": record.service_name,
                "event.dataset": record.dataset,
                "log.logger": record.name,
                "process.thread.name": record.threadName,
                "log.origin": {
                    "file.path": record.origin_file_path,
                    "function.name": record.origin_func,
                    "line.number": record.origin_line,
                },
                "code.function": record.origin_func,
                "labels": {
                    "environment": record.env,
                    "deployment.environment": record.env,
                },
            }
        )
        
        # 🔥 ELIMINAR campos duplicados que pythonjsonlogger añade automáticamente
        for dup_key in ["msg", "args", "exc_info", "exc_text", "stack_info"]:
            log_record.pop(dup_key, None)

    def format(self, record):
        # Serialización única y segura (unicode friendly)
        log_record = {}
        self.add_fields(log_record, record, record.__dict__)
        return json.dumps(log_record, default=str, ensure_ascii=False)

# ──────────────────────────────────────────────────────────────────────
# 4) Configuración dictConfig (solo consola)
# ---------------------------------------------------------------------
def configure_logging() -> None:
    """Configura logging para consola JSON (stdout). Sin OTLP."""
    global _LOGGING_CONFIGURED
    
    # ⭐ Guard: solo configurar una vez
    if _LOGGING_CONFIGURED:
        return
    
    # ⭐ Limpiar handlers existentes del root logger
    root = logging.getLogger()
    root.handlers.clear()
    
    json_enabled = bool(getattr(settings, "JSON_LOGS", True))
    log_level = getattr(settings, "LOG_LEVEL", "INFO").upper()

    handlers: dict[str, dict] = {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json" if json_enabled else "standard",
            "stream": sys.stdout,
        }
    }

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {"()": EcsJsonFormatter, "format": "%(message)s"},
                "standard": {
                    "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
                },
            },
            "handlers": handlers,
            "loggers": {
                # Tu app
                "src": {
                    "handlers": ["console"], 
                    "level": log_level, 
                    "propagate": False  # ⭐ CAMBIADO: evita duplicados
                },

                # FastAPI/Uvicorn
                "uvicorn": {
                    "handlers": ["console"], 
                    "level": log_level, 
                    "propagate": False
                },
                "uvicorn.error": {
                    "handlers": ["console"], 
                    "level": log_level, 
                    "propagate": False
                },
                "uvicorn.access": {
                    "handlers": ["console"], 
                    "level": log_level, 
                    "propagate": False
                },

                # Root: captura cualquier otro logger
                "": {
                    "handlers": ["console"], 
                    "level": "INFO", 
                    "propagate": False  # ⭐ CAMBIADO
                },
            },
        }
    )

    # ⭐ Marcar como configurado
    _LOGGING_CONFIGURED = True
    logging.getLogger("src").info("Logging ECS configurado correctamente", extra={"service": SERVICE_NAME})