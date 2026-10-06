from __future__ import annotations

import msgspec


class DeleteResult(msgspec.Struct, frozen=True):
    id: str
    deleted: bool = True
