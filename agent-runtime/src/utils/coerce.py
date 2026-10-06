from collections.abc import Sequence


def to_float(value: object) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", ".").strip())
        except ValueError:
            return None
    return None


def to_bool(value: object, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "si", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return default


def coerce_bounded_int(
    value: object,
    *,
    default: int,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    parsed: int | None = None
    if isinstance(value, (int, float)):
        parsed = int(value)
    elif isinstance(value, str):
        try:
            parsed = int(float(value.strip()))
        except ValueError:
            return default

    if parsed is None:
        return default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def coerce_float_pair(
    value: object,
    *,
    default: Sequence[float],
    positive: bool = False,
) -> list[float]:
    if (
        isinstance(value, Sequence)
        and not isinstance(value, (str, bytes, bytearray))
        and len(value) == 2
    ):
        first = to_float(value[0])
        second = to_float(value[1])
        if first is not None and second is not None:
            if not positive or (first > 0 and second > 0):
                return [first, second]
    return [float(default[0]), float(default[1])]
