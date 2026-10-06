from __future__ import annotations

from collections.abc import Mapping
from functools import reduce
from typing import Any


def coerce_usage_mapping(payload: Mapping[str, Any] | dict[str, Any]) -> dict[str, Any]:
    """Convierte un payload de uso en un dict JSON-friendly con claves string."""
    return {str(key): value for key, value in payload.items()}


def usage_number(value: Any) -> int | float | None:
    """Extrae un valor numérico utilizable de un payload de uso."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return value
    return None


def add_usage_values(left: Any, right: Any) -> Any:
    """Combina dos valores de uso preservando la forma más informativa."""
    if isinstance(left, dict) and isinstance(right, dict):
        return add_two_usages(left, right)

    left_number = usage_number(left)
    right_number = usage_number(right)
    if left_number is not None and right_number is not None:
        return left_number + right_number

    if right is None:
        return left
    return right


def add_two_usages(
    dict1: dict[str, Any],
    dict2: dict[str, Any],
) -> dict[str, Any]:
    """Suma dos estructuras de uso campo a campo."""
    if not dict1:
        return dict(dict2)
    if not dict2:
        return dict(dict1)
    result: dict[str, Any] = {}
    for key in set(dict1.keys()) | set(dict2.keys()):
        if key in dict1 and key in dict2:
            result[key] = add_usage_values(dict1[key], dict2[key])
            continue
        if key in dict1:
            result[key] = dict1[key]
            continue
        result[key] = dict2[key]
    return result


def add_usages(*dicts: dict[str, Any]) -> dict[str, Any]:
    """Acumula varios payloads de uso en un único objeto."""
    if not dicts:
        return {}
    return reduce(add_two_usages, dicts)
