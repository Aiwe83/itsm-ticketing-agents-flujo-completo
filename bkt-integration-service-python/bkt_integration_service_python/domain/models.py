"""Modelos de dominio, equivalentes a src/utils/issue.util.ts (formas de datos)
y src/models/Mapping.model.ts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Mapping:
    """Equivalente a IMapping (src/models/Mapping.model.ts)."""

    id: str
    source_field: str
    target_field: str
    required: bool
    mesh_id: str
    transformer: str = "copy"
    options: dict[str, Any] = field(default_factory=dict)
    description: str | None = None

    @classmethod
    def from_mongo(cls, doc: dict[str, Any]) -> "Mapping":
        return cls(
            id=str(doc["_id"]),
            source_field=doc["sourceField"],
            target_field=doc["targetField"],
            required=bool(doc.get("required", False)),
            mesh_id=doc["meshId"],
            transformer=doc.get("transformer") or "copy",
            options=doc.get("options") or {},
            description=doc.get("description"),
        )


def default_issue_content() -> dict[str, Any]:
    """Equivalente a DEFAULT_CONTENT en issue.util.ts. Nuevo dict cada vez
    (equivalente al structuredClone del TS original).

    El contenido ya no tiene una lista fija de campos: la forma real la
    define el catalogo de mappings en Mongo (targetField), no este tipo.
    Solo se garantiza `attachedDocuments`."""

    return {
        "attachedDocuments": [],
    }


@dataclass
class IssueInfo:
    """Equivalente a IssueInfo (src/utils/issue.util.ts)."""

    mesh_id: str
    content: dict[str, Any] = field(default_factory=default_issue_content)

    def to_dict(self) -> dict[str, Any]:
        return {
            "meshId": self.mesh_id,
            "content": self.content,
        }
