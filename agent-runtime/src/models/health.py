from __future__ import annotations

from typing import Literal

import msgspec


class DependencyHealth(msgspec.Struct, frozen=True):
    name: str
    kind: str
    status: Literal["configured", "not_configured", "disabled"]
    configured: bool
    healthy: bool | None = None
    detail: str | None = None


class HealthReport(msgspec.Struct, frozen=True):
    status: Literal["ok"]
    service: str
    version: str
    environment: str
    dependencies: tuple[DependencyHealth, ...]
