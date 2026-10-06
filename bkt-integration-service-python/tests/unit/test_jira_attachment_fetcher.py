"""Port 1:1 de src/__tests__/jira-attachment.fetcher.test.ts."""

from __future__ import annotations

import base64

import httpx
import pytest

from bkt_integration_service_python.services.jira_attachment_fetcher import JiraAttachmentFetcher


async def test_rejects_attachment_urls_outside_configured_jira_origin() -> None:
    fetcher = JiraAttachmentFetcher(base_url="https://jira.example", user="jira-user", password="jira-password")

    with pytest.raises(ValueError, match="Attachment host is not allowed"):
        await fetcher.fetch({"filename": "evil.txt", "content": "https://attacker.example/attachment/1"})


async def test_downloads_attachments_from_configured_jira_origin() -> None:
    fetcher = JiraAttachmentFetcher(
        base_url="https://jira.example/base",
        user="jira-user",
        password="jira-password",
        bytes_limit=1024,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://jira.example/secure/attachment/1"
        auth = request.headers["authorization"]
        assert auth.startswith("Basic ")
        decoded = base64.b64decode(auth.removeprefix("Basic ")).decode()
        assert decoded == "jira-user:jira-password"
        return httpx.Response(200, content=b"downloaded")

    transport = httpx.MockTransport(handler)
    original_client = httpx.AsyncClient

    def _client_factory(*args, **kwargs):
        kwargs["transport"] = transport
        return original_client(*args, **kwargs)

    import bkt_integration_service_python.services.jira_attachment_fetcher as module

    module.httpx.AsyncClient = _client_factory
    try:
        result = await fetcher.fetch({"filename": "ok.txt", "content": "https://jira.example/secure/attachment/1"})
    finally:
        module.httpx.AsyncClient = original_client

    assert result == b"downloaded"
