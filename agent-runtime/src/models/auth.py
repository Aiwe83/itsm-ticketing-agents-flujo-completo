from __future__ import annotations

from typing import Any

import msgspec


class AuthenticatedPrincipal(msgspec.Struct, frozen=True):
    subject: str
    email: str | None = None
    display_name: str | None = None
    raw_claims: dict[str, Any] = msgspec.field(default_factory=dict)
