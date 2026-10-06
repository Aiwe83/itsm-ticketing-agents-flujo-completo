"""Enriquecido de adjuntos a texto plano, port 1:1 de src/services/attachment.service.ts.

Solo relevante para el camino manual secundario (`bkt-jira-forge`, ticket
`BFC-2`): el trigger automatico real (`bkt-jira-triggers`) nunca envia
`fields.attachment` (confirmado y documentado en HANDOFF.md y en las guias
de demo). No portado en las Fases 0-4 originales por eso mismo; se porta
ahora para completar la equivalencia de contrato (ver
`contexto_para_proyectos/Comparativa_TS_vs_Python_bkt_integration_service_TICK-139.md`).
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

import mammoth

from bkt_integration_service_python.core.logging import logger

AttachmentSkipReason = Literal["unsupported", "too_large", "download_failed"]

TEXT_EXTENSIONS = {"txt", "log", "csv", "xml", "htm", "html", "n43", "n34", "mt940"}
WORD_EXTENSIONS = {"docx", "dotx", "odt"}


@dataclass
class PlainTextAttachment:
    filename: str
    plain_text: str
    skipped_reason: AttachmentSkipReason | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"filename": self.filename, "plainText": self.plain_text}
        if self.skipped_reason is not None:
            result["skippedReason"] = self.skipped_reason
        return result


class AttachmentFetcher(Protocol):
    async def fetch(self, attachment: dict[str, Any]) -> bytes: ...


@dataclass
class AttachmentService:
    fetcher: AttachmentFetcher | None = None
    bytes_limit: int = field(default=4_194_304)

    async def process_attachments(
        self, attachments: Any, issue_key: str | None = None
    ) -> list[dict[str, Any]]:
        if not isinstance(attachments, list) or len(attachments) == 0:
            return []

        processed: list[dict[str, Any]] = []
        for attachment in attachments:
            if not self._is_raw_attachment(attachment):
                continue
            result = await self.convert_attachment_to_text(attachment, issue_key)
            if result is not None:
                processed.append(result.to_dict())
        return processed

    async def convert_attachment_to_text(
        self, attachment: dict[str, Any], issue_key: str | None = None
    ) -> PlainTextAttachment | None:
        filename = self._get_filename(attachment)
        extension = self._get_extension(filename)

        if extension not in TEXT_EXTENSIONS and extension not in WORD_EXTENSIONS:
            return PlainTextAttachment(filename, "", "unsupported")

        if self._is_declared_too_large(attachment):
            return PlainTextAttachment(filename, "", "too_large")

        buffer = await self._read_attachment_buffer(attachment, filename, issue_key)
        if buffer is None:
            return PlainTextAttachment(filename, "", "download_failed")

        if len(buffer) > self.bytes_limit:
            return PlainTextAttachment(filename, "", "too_large")

        if extension in TEXT_EXTENSIONS:
            return PlainTextAttachment(filename, buffer.decode("utf-8", errors="replace").strip())

        result = mammoth.extract_raw_text(io.BytesIO(buffer))
        return PlainTextAttachment(filename, result.value.strip())

    async def _read_attachment_buffer(
        self, attachment: dict[str, Any], filename: str, issue_key: str | None
    ) -> bytes | None:
        buffer = attachment.get("buffer")
        if isinstance(buffer, (bytes, bytearray)):
            return bytes(buffer)
        if isinstance(buffer, str):
            return buffer.encode("utf-8")

        data = attachment.get("data")
        if isinstance(data, str):
            return data.encode("utf-8")

        content = attachment.get("content")
        if isinstance(content, str) and not self._is_remote_url(content):
            return content.encode("utf-8")

        if self.fetcher is None:
            logger.warning(
                f"Attachment download skipped because no Jira fetcher is configured "
                f"filename={filename} issueKey={issue_key}"
            )
            return None

        try:
            return await self.fetcher.fetch(attachment)
        except Exception as error:  # noqa: BLE001 - equivalente a catch(error) del TS
            logger.warning(f"Attachment download failed filename={filename} issueKey={issue_key}: {error}")
            return None

    def _is_declared_too_large(self, attachment: dict[str, Any]) -> bool:
        declared_size = attachment.get("size")
        try:
            return float(declared_size) > self.bytes_limit
        except (TypeError, ValueError):
            return False

    def _get_filename(self, attachment: dict[str, Any]) -> str:
        return attachment.get("filename") or attachment.get("name") or "attachment"

    def _get_extension(self, filename: str) -> str:
        parts = filename.split(".")
        return parts[-1].lower() if len(parts) > 1 else ""

    def _is_remote_url(self, value: str) -> bool:
        return value.startswith("http://") or value.startswith("https://")

    def _is_raw_attachment(self, value: Any) -> bool:
        return isinstance(value, dict)
