"""Motor de transformacion de tickets por mappings.

Port 1:1 de src/utils/issue.util.ts (transformIssuePayload, getValueByPath,
setValueByPath y los 3 transformadores copy/mapToString/severity). Es la pieza
de mayor riesgo de toda la migracion (marcado explicitamente en el plan): no
cambiar el comportamiento observable, solo el lenguaje.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from bkt_integration_service_python.core.errors import AppError
from bkt_integration_service_python.domain.models import IssueInfo, Mapping, default_issue_content

_ARRAY_SEGMENT = re.compile(r"^(?P<key>.+)\[(?P<index>\*|\d+)\]$")


class MappingValidationError(AppError):
    """Equivalente a ValidationError lanzado desde transformIssuePayload cuando
    falta un valor obligatorio."""

    def __init__(self, message: str, details: Any = None) -> None:
        super().__init__(400, message, "VALIDATION_ERROR", details)


def _get_value_by_path(payload: dict[str, Any], path: str) -> Any:
    """Equivalente a getValueByPath. Soporta segmentos `campo[*]`/`campo[n]`."""

    if not path:
        return None

    current: Any = payload
    for segment in path.split("."):
        if current is None:
            return None

        match = _ARRAY_SEGMENT.match(segment)
        if match:
            key = match.group("key")
            index = match.group("index")
            current = current.get(key) if isinstance(current, dict) else None
            if not isinstance(current, list):
                return None
            if index == "*":
                return current
            numeric_index = int(index)
            current = current[numeric_index] if 0 <= numeric_index < len(current) else None
        else:
            current = current.get(segment) if isinstance(current, dict) else None

    return current


def _set_value_by_path(target: dict[str, Any], path: str, value: Any) -> None:
    """Equivalente a setValueByPath. `[*]` al final del target acumula (push)
    en vez de sobrescribir."""

    array_suffix = "[*]"
    is_array_target = path.endswith(array_suffix)
    cleaned_path = path[: -len(array_suffix)] if is_array_target else path
    segments = [segment for segment in cleaned_path.split(".") if segment]

    current = target
    for i, segment in enumerate(segments):
        is_last = i == len(segments) - 1
        if is_last:
            if is_array_target:
                if not isinstance(current.get(segment), list):
                    current[segment] = []
                values = value if isinstance(value, list) else [value]
                current[segment].extend(values)
            else:
                current[segment] = value
            return

        if not isinstance(current.get(segment), dict):
            current[segment] = {}
        current = current[segment]


def _as_record_array(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [{"value": str(value)}]


def _format_map_to_string(record: dict[str, Any], mapping: Mapping) -> str:
    options = mapping.options.get("transformer", {}) if mapping.options else {}
    result = ""
    for key, val in record.items():
        result += f"{options.get(key)}: {val}\n"
    return result


_SEVERITY_MAP = {
    "critical": "1",
    "1": "1",
    "high": "2",
    "2": "2",
    "medium": "3",
    "moderate": "3",
    "3": "3",
    "low": "4",
    "minor": "4",
    "4": "4",
}


def _normalize_severity(severity: Any) -> str | None:
    if severity is None:
        return None
    if isinstance(severity, bool):
        return None
    if isinstance(severity, (int, float)):
        return str(severity)
    if not isinstance(severity, str):
        return None
    return _SEVERITY_MAP.get(severity.lower(), severity)


TransformerFn = Callable[[dict[str, Any], Mapping, Any], Any]


def _copy(_payload: dict[str, Any], _mapping: Mapping, value: Any) -> Any:
    return value


def _map_to_string(_payload: dict[str, Any], mapping: Mapping, value: Any) -> list[str]:
    return [_format_map_to_string(record, mapping) for record in _as_record_array(value)]


def _severity(_payload: dict[str, Any], _mapping: Mapping, value: Any) -> str | None:
    return _normalize_severity(value)


_TRANSFORMER_REGISTRY: dict[str, TransformerFn] = {
    "copy": _copy,
    "mapToString": _map_to_string,
    "severity": _severity,
}


def _get_transformer(name: str | None) -> TransformerFn:
    if not name:
        return _copy
    transformer = _TRANSFORMER_REGISTRY.get(name)
    if transformer is None:
        raise ValueError(f'Unknown mapping transformer "{name}"')
    return transformer


def transform_issue_payload(payload: dict[str, Any], mappings: list[Mapping], mesh_id: str) -> IssueInfo:
    """Equivalente a transformIssuePayload (src/utils/issue.util.ts).

    El TS original llama a `setValueByPath(issueInfo, targetPath, value)` mutando
    directamente el objeto completo (meshId/content). Aqui se replica igual: se
    opera sobre un unico dict `state` con esa misma forma durante toda la
    transformacion, y solo al final se reconstruye el dataclass `IssueInfo` a
    partir de `state`. El catalogo de mappings (Mongo) es quien decide la forma
    real de `content` via `targetField` (p.ej. "content.key"), no este codigo.
    """

    state: dict[str, Any] = {
        "meshId": mesh_id,
        "content": default_issue_content(),
    }

    for mapping in mappings:
        raw_value = _get_value_by_path(payload, mapping.source_field)
        transformer = _get_transformer(mapping.transformer)
        transformed_value = transformer(payload, mapping, raw_value)

        is_empty = (
            transformed_value is None
            or (isinstance(transformed_value, str) and len(transformed_value) == 0)
        )
        if is_empty:
            if mapping.required:
                raise MappingValidationError(
                    f"Missing required value for mapping {mapping.target_field}",
                    {
                        "targetField": mapping.target_field,
                        "sourceField": mapping.source_field,
                        "rawValue": raw_value,
                    },
                )
            continue

        _set_value_by_path(state, mapping.target_field, transformed_value)

    return IssueInfo(
        mesh_id=state["meshId"],
        content=state["content"],
    )
