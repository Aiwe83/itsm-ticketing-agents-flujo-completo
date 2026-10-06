from __future__ import annotations

from models.health import HealthReport


class HealthResponse(HealthReport, frozen=True):
    request_id: str | None = None
