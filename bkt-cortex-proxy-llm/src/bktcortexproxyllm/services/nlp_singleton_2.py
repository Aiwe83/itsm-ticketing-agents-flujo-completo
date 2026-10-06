"""
Módulo de sanitización de texto para anonimización de datos sensibles.

Este módulo detecta y reemplaza información sensible (emails, NIFs, IBANs, etc.)
en textos, manteniendo trazabilidad de las sustituciones realizadas.

Funciones principales:
    - sanitize_content_only: Sanitiza mensajes en requests de chat
    - inverted_substitutions: Revierte las sustituciones en un texto
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


# =============================================================================
# Configuración de patrones
# =============================================================================

# Patrones precompilados para datos sensibles
_SENSITIVE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'(https?|ftp)://[^\s"\'<>\\]+', re.IGNORECASE), "@Url"),
    (re.compile(r'www\.[^\s"\'<>]+', re.IGNORECASE), "@Direccion_Web"),
    (re.compile(r'(apikey|api-key)\s*[=:]\s*["\']?[A-Za-z0-9][A-Za-z0-9\-_]*["\']?', re.IGNORECASE), "@Apikey"),
    (re.compile(r'(token)\s*[=:]\s*["\']?[A-Za-z0-9][A-Za-z0-9\-_]*["\']?', re.IGNORECASE), "@Token"),
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b', re.IGNORECASE), "@Mail"),
    (re.compile(r'\b[A-Z]{2}\d{2}(?:\s?[A-Z\d]{4}){3,7}\b', re.IGNORECASE), "@Iban"),
    # SWIFT/BIC: 8 u 11 caracteres, SOLO MAYÚSCULAS (los códigos reales nunca son minúsculas)
    # Formato: 4 letras (banco) + 2 letras (país) + 2 alfanum (ubicación) + 3 alfanum opcional (sucursal)
    # (re.compile(r'\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b'), "@Swift"), PROBLEMAS CON LA PALABRA REOPENED
    (re.compile(
        r'\b(?:'
        r'4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}|'
        r'5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}|'
        r'6(?:011|5\d{2})[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}|'
        r'3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}'
        r')\b',
        re.IGNORECASE
    ), "@Credit"),
]
_ID_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\b[A-Z]{1,2}\d{6,7}\b', re.IGNORECASE), "@Carnet"),
    (re.compile(r'\b\d{2}/\d{8}/\d{2}\b'), "@Ss"),
    (re.compile(r'\b([A-Z]\d{7}[A-Z]|\d{8}[A-Z])\b', re.IGNORECASE), "@Nif"),
    (re.compile(r'\b[XYZ]\d{7}[A-Z]\b', re.IGNORECASE), "@Nie"),
]
# Campos base64 que no deben sanitizarse
_BASE64_FIELDS: frozenset[str] = frozenset([
    'image', 'image_base64', 'audio', 'audio_base64',
    'file', 'file_base64', 'document', 'attachment'
])

# Caracteres a preservar en normalización de acentos
# Solo ñ/Ñ porque son letras distintas en español
# Las vocales acentuadas NO se preservan para que "López" coincida con "Lopez"
_PRESERVED_CHARS: frozenset[str] = frozenset('ñÑ')

# Caché para patrones de archivos
_pattern_cache: dict[str, tuple[float, list[re.Pattern]]] = {}


# =============================================================================
# Funciones internas
# =============================================================================

def _normalize_escapes(text: str) -> str:
    """
    Normaliza secuencias de escape múltiples en el texto.
    
    Maneja casos problemáticos como:
        - \\\\\\' -> '
        - \\\' -> '
        - \\' -> '
        - \' -> '
    """
    if not text:
        return text
    
    result = text
    
    # Procesar escapes de comillas simples (de más a menos backslashes)
    while True:
        new_result = re.sub(
            r"\\{2,}'",
            lambda m: "\\" * (len(m.group(0)) - 2) + "'" if len(m.group(0)) > 2 else "'",
            result
        )
        if new_result == result:
            break
        result = new_result
    
    # Escape simple \' -> '
    result = result.replace("\\'", "'")
    
    # Procesar escapes de comillas dobles
    while True:
        new_result = re.sub(
            r'\\{2,}"',
            lambda m: "\\" * (len(m.group(0)) - 2) + '"' if len(m.group(0)) > 2 else '"',
            result
        )
        if new_result == result:
            break
        result = new_result
    
    # Escape simple \" -> "
    result = result.replace('\\"', '"')
    
    # Backslashes múltiples no seguidos de comillas
    while True:
        new_result = re.sub(r'\\\\(?![\'"])', r'\\', result)
        if new_result == result:
            break
        result = new_result
    
    # Unicode escapado \uXXXX
    result = re.sub(
        r"\\u([0-9a-fA-F]{4})",
        lambda m: chr(int(m.group(1), 16)),
        result
    )
    
    return result


@lru_cache(maxsize=1024)
def _normalize_accents(text: str) -> str:
    """Normaliza acentos preservando caracteres españoles comunes."""
    if not text:
        return text
    
    result = []
    for char in text:
        if char in _PRESERVED_CHARS:
            result.append(char)
        else:
            normalized = unicodedata.normalize('NFD', char)
            filtered = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
            result.append(filtered)
    
    return ''.join(result)


def _load_patterns_from_file(file_path: str | Path) -> list[re.Pattern]:
    """Carga patrones desde un archivo con caché."""
    file_path = Path(file_path)
    
    if not file_path.exists():
        logger.debug(f"Archivo de patrones no encontrado: {file_path}")
        return []
    
    try:
        current_mtime = file_path.stat().st_mtime
        cache_key = str(file_path)
        
        # Verificar caché
        if cache_key in _pattern_cache:
            cached_mtime, cached_patterns = _pattern_cache[cache_key]
            if cached_mtime == current_mtime:
                return cached_patterns
        
        # Cargar patrones
        patterns = []
        for encoding in ['utf-8', 'cp1252', 'latin-1']:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith('#'):
                            continue
                        try:
                            escaped = re.escape(line)
                            normalized = _normalize_accents(escaped)
                            pattern = re.compile(rf'\b{normalized}\b', re.IGNORECASE)
                            patterns.append(pattern)
                        except re.error as e:
                            logger.warning(f"Patrón inválido en {file_path}: '{line}' - {e}")
                break
            except UnicodeDecodeError:
                continue
        
        _pattern_cache[cache_key] = (current_mtime, patterns)
        logger.debug(f"Cargados {len(patterns)} patrones desde {file_path}")
        return patterns
        
    except Exception as e:
        logger.error(f"Error cargando patrones desde {file_path}: {e}")
        return []


def _sanitize_text(
    text: str,
    counters: dict[str, int],
    substitutions: dict[str, str],
    org_patterns: list[re.Pattern],
    user_patterns: list[re.Pattern]
) -> tuple[str, bool]:
    """
    Sanitiza un texto individual.
    
    Returns:
        Tupla (texto_sanitizado, se_encontraron_datos_sensibles)
    """
    if not text:
        return text, False
    
    found_sensitive_data = False
    
    # Normalizar escapes problemáticos
    working_text = _normalize_escapes(text)
    
    # Detectar y manejar JSON
    is_json = False
    payload: dict[str, Any] | None = None
    base64_data: dict[str, Any] = {}
    
    try:
        parsed = json.loads(working_text)
        if isinstance(parsed, dict):
            is_json = True
            payload = parsed
            # Guardar campos base64
            for field in _BASE64_FIELDS:
                if field in payload:
                    base64_data[field] = payload[field]
                    payload[field] = f"__{field.upper()}_PLACEHOLDER__"
            working_text = json.dumps(payload, ensure_ascii=False)
    except json.JSONDecodeError:
        pass
    
    # Normalizar acentos para búsqueda
    text_for_matching = _normalize_accents(working_text)
    
    # Función para crear sustituciones
    def make_substitution(matched_text: str, label: str) -> str:
        existing = next((k for k, v in substitutions.items() if v == matched_text), None)
        if existing:
            return existing
        key = f"{label}{counters[label]}"
        substitutions[key] = matched_text
        counters[label] += 1
        return key
    
    # Aplicar patrones de datos sensibles
    for pattern, _label in _SENSITIVE_PATTERNS:
        text_for_matching, count = pattern.subn(
            lambda m: make_substitution(m.group(0), 'OTR'),
            text_for_matching
        )
        if count > 0:
            found_sensitive_data = True
    
        # Aplicar patrones de datos sensibles
    for pattern, _label in _ID_PATTERNS:
        text_for_matching, count = pattern.subn(
            lambda m: make_substitution(m.group(0), 'PID'),
            text_for_matching
        )
        if count > 0:
            found_sensitive_data = True
    
    # Aplicar patrones de organizaciones
    for pattern in org_patterns:
        text_for_matching, count = pattern.subn(
            lambda m: make_substitution(m.group(0), 'OGR'),
            text_for_matching
        )
        if count > 0:
            found_sensitive_data = True
    
    # Aplicar patrones de usuarios
    for pattern in user_patterns:
        text_for_matching, count = pattern.subn(
            lambda m: make_substitution(m.group(0), 'PRV'),
            text_for_matching
        )
        if count > 0:
            found_sensitive_data = True
    
    # Reconstruir JSON si es necesario
    if is_json:
        try:
            result_payload = json.loads(text_for_matching)
            for field, value in base64_data.items():
                if f"__{field.upper()}_PLACEHOLDER__" in str(result_payload):
                    result_payload[field] = value
            final_text = json.dumps(result_payload, ensure_ascii=False)
        except json.JSONDecodeError:
            final_text = text_for_matching
    else:
        final_text = text_for_matching
    
    return final_text, found_sensitive_data


# =============================================================================
# Funciones públicas
# =============================================================================

def sanitize_content_only(
    request_data: dict,
    sanitize: bool = True,
    orgs_file: str = "orgs.txt",
    users_file: str = "users.txt"
) -> tuple[dict, dict[str, str]]:
    """
    Anonimiza los campos de texto dentro de los mensajes de un request.
    
    Solo aplica la anonimización cuando el rol del mensaje NO es "system".
    
    Args:
        request_data: Diccionario con estructura {"messages": [...]}
        sanitize: Si es False, devuelve los datos sin modificar
        orgs_file: Ruta al archivo de patrones de organizaciones
        users_file: Ruta al archivo de patrones de usuarios
    
    Returns:
        Tupla con (request_data_sanitizado, diccionario_de_sustituciones)
    
    Ejemplo:
        >>> request = {"messages": [{"role": "user", "content": "Mi email es test@ejemplo.com"}]}
        >>> result, subs = sanitize_content_only(request)
        >>> print(result["messages"][0]["content"])
        "Mi email es OTR1"
        >>> print(subs)
        {"OTR1": "test@ejemplo.com"}
    """
    if not sanitize:
        return deepcopy(request_data), {}
    
    request_data_copy = deepcopy(request_data)
    substitutions: dict[str, str] = {}
    counters = {'PRV': 1, 'OGR': 1, 'OTR': 1, 'PID': 1}
    
    # Cargar patrones de archivos
    org_patterns = _load_patterns_from_file(orgs_file)
    user_patterns = _load_patterns_from_file(users_file)
    
    messages = request_data_copy.get("messages", [])
    
    for message in messages:
        # Saltar mensajes de sistema
        if message.get("role") == "system":
            continue
        
        content = message.get("content")
        
        if isinstance(content, list):
            # content es una lista de objetos con type y text
            for part in content:
                if part.get("type") == "text" and isinstance(part.get("text"), str):
                    sanitized, _ = _sanitize_text(
                        part["text"],
                        counters,
                        substitutions,
                        org_patterns,
                        user_patterns
                    )
                    part["text"] = sanitized
                    
        elif isinstance(content, str):
            sanitized, _ = _sanitize_text(
                content,
                counters,
                substitutions,
                org_patterns,
                user_patterns
            )
            message["content"] = sanitized
    
    return request_data_copy, substitutions


def inverted_substitutions(text: str, substitutions: dict[str, str] | list) -> str:
    """
    Revierte las sustituciones en el texto, restaurando los valores originales.
    
    Args:
        text: Texto con sustituciones (ej: "Contactar a OTR1")
        substitutions: Diccionario de sustituciones {código: valor_original}
    
    Returns:
        Texto con los valores originales restaurados
    
    Ejemplo:
        >>> text = "Contactar a OTR1"
        >>> subs = {"OTR1": "test@ejemplo.com"}
        >>> inverted_substitutions(text, subs)
        "Contactar a test@ejemplo.com"
    """
    # Manejar lista vacía (compatibilidad)
    if isinstance(substitutions, list):
        if not substitutions:
            return text
        logger.warning("Se recibió lista en lugar de dict para sustituciones")
        return text
    
    if not substitutions:
        return text
    
    # Ordenar por longitud descendente para evitar reemplazos parciales
    # (ej: OTR10 debe procesarse antes que OTR1)
    sorted_items = sorted(
        substitutions.items(),
        key=lambda x: len(x[0]),
        reverse=True
    )
    
    result = text
    for placeholder, original in sorted_items:
        # Usar word boundary para evitar reemplazos parciales
        pattern = re.compile(re.escape(placeholder) + r'\b')
        result = pattern.sub(original, result)
    
    return result


def clear_pattern_cache() -> None:
    """Limpia la caché de patrones cargados desde archivos."""
    _pattern_cache.clear()
    _normalize_accents.cache_clear()
    logger.debug("Caché de patrones limpiada")