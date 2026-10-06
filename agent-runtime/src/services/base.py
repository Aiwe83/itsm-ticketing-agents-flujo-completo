from __future__ import annotations

from abc import ABC
from datetime import datetime, timezone
from typing import NoReturn

from bson import ObjectId

from core.errors import ApplicationError


class BaseService(ABC):
    """Base class for services."""

    @staticmethod
    def _not_implemented(capability: str) -> NoReturn:
        raise NotImplementedError(f"{capability} is not implemented yet.")

    @staticmethod
    def _normalize_object_id(value: str, *, field_name: str) -> str:
        normalized = value.strip()
        if not normalized or not ObjectId.is_valid(normalized):
            raise ApplicationError(
                message=f"Invalid {field_name} value '{value}'.",
                status_code=400,
                error_name="invalid_object_id",
            )
        return str(ObjectId(normalized))

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)
