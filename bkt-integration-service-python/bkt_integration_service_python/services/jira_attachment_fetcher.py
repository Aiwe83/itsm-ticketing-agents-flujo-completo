"""Descarga de adjuntos desde Jira, port 1:1 de src/services/jira-attachment.fetcher.ts.

Mismo alcance que attachment_service.py: solo relevante para el camino
manual secundario (BFC-2 via bkt-jira-forge).
"""

from __future__ import annotations

import base64
from urllib.parse import urlparse

import httpx

DEFAULT_TIMEOUT_S = 30.0


class JiraAttachmentFetcher:
    def __init__(
        self,
        *,
        base_url: str,
        user: str,
        password: str,
        bytes_limit: int = 4_194_304,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self._base_url = base_url
        self._user = user
        self._password = password
        self._bytes_limit = bytes_limit
        self._timeout_s = timeout_s
        self._allowed_origin = self._origin(base_url)

    @staticmethod
    def _origin(url: str) -> str:
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"

    async def fetch(self, attachment: dict[str, object]) -> bytes:
        content = attachment.get("content")
        if not isinstance(content, str):
            raise ValueError("Attachment content URL is required")

        if self._origin(content) != self._allowed_origin:
            raise ValueError("Attachment host is not allowed")

        credentials = base64.b64encode(f"{self._user}:{self._password}".encode()).decode()
        headers = {"authorization": f"Basic {credentials}"}

        async with httpx.AsyncClient(follow_redirects=False, timeout=self._timeout_s) as client:
            response = await client.get(content, headers=headers)
            response.raise_for_status()
            body = response.content
            if len(body) > self._bytes_limit:
                raise ValueError("Attachment response exceeds the configured byte limit")
            return body


def create_jira_attachment_fetcher(
    *,
    jira_base_url: str | None,
    jira_user: str | None,
    jira_password: str | None,
    attachment_bytes_limit: int,
) -> JiraAttachmentFetcher | None:
    if not jira_base_url or not jira_user or not jira_password:
        return None

    return JiraAttachmentFetcher(
        base_url=jira_base_url,
        user=jira_user,
        password=jira_password,
        bytes_limit=attachment_bytes_limit,
    )
