"""Port 1:1 de src/__tests__/attachment.service.test.ts."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from bkt_integration_service_python.services.attachment_service import AttachmentService


class _StubResult:
    def __init__(self, value: str) -> None:
        self.value = value


async def test_converts_inline_txt_attachment_to_plain_text() -> None:
    service = AttachmentService(bytes_limit=1024)

    result = await service.process_attachments([{"filename": "nota.txt", "data": " Texto visible para agentes "}])

    assert result == [{"filename": "nota.txt", "plainText": "Texto visible para agentes"}]


async def test_converts_word_attachment_through_mammoth() -> None:
    service = AttachmentService(bytes_limit=1024)

    with patch(
        "bkt_integration_service_python.services.attachment_service.mammoth.extract_raw_text",
        return_value=_StubResult(" Texto Word "),
    ) as extract_mock:
        result = await service.process_attachments([{"filename": "informe.docx", "buffer": b"docx"}])

    extract_mock.assert_called_once()
    assert result == [{"filename": "informe.docx", "plainText": "Texto Word"}]


async def test_marks_unsupported_extensions_without_raising() -> None:
    service = AttachmentService(bytes_limit=1024)

    result = await service.process_attachments([{"filename": "imagen.png", "data": "binary"}])

    assert result == [{"filename": "imagen.png", "plainText": "", "skippedReason": "unsupported"}]


async def test_marks_remote_attachments_as_download_failed_without_fetcher() -> None:
    service = AttachmentService(bytes_limit=1024)

    result = await service.process_attachments(
        [{"filename": "remoto.txt", "content": "https://jira.example/attachment/1"}]
    )

    assert result == [{"filename": "remoto.txt", "plainText": "", "skippedReason": "download_failed"}]


async def test_uses_fetcher_for_remote_attachments() -> None:
    class _Fetcher:
        def __init__(self) -> None:
            self.calls = 0

        async def fetch(self, attachment: dict) -> bytes:
            self.calls += 1
            return b"texto descargado"

    fetcher = _Fetcher()
    service = AttachmentService(fetcher=fetcher, bytes_limit=1024)

    result = await service.process_attachments(
        [{"filename": "remoto.txt", "content": "https://jira.example/attachment/1"}]
    )

    assert fetcher.calls == 1
    assert result == [{"filename": "remoto.txt", "plainText": "texto descargado"}]


async def test_skips_attachments_above_declared_or_real_byte_limit() -> None:
    class _Fetcher:
        async def fetch(self, attachment: dict) -> bytes:
            return b"demasiado grande"

    service = AttachmentService(fetcher=_Fetcher(), bytes_limit=4)

    result = await service.process_attachments(
        [
            {"filename": "declarado.txt", "size": 10, "data": "ok"},
            {"filename": "real.txt", "content": "https://jira.example/attachment/2"},
        ]
    )

    assert result == [
        {"filename": "declarado.txt", "plainText": "", "skippedReason": "too_large"},
        {"filename": "real.txt", "plainText": "", "skippedReason": "too_large"},
    ]


async def test_keeps_processing_rest_of_list_when_one_fails() -> None:
    class _Fetcher:
        async def fetch(self, attachment: dict) -> bytes:
            raise RuntimeError("network error")

    service = AttachmentService(fetcher=_Fetcher(), bytes_limit=1024)

    result = await service.process_attachments(
        [
            {"filename": "ok.txt", "data": "correcto"},
            {"filename": "roto.txt", "content": "https://jira.example/attachment/3"},
        ]
    )

    assert result == [
        {"filename": "ok.txt", "plainText": "correcto"},
        {"filename": "roto.txt", "plainText": "", "skippedReason": "download_failed"},
    ]
