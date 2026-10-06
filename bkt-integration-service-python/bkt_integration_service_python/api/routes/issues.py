"""POST /api/v1/issues, equivalente a src/routes/issue.routes.ts + issue.controller.ts.

Autenticacion por API key aplicada aqui mismo (equivalente al middleware
`apiKeyMiddleware` montado sobre todo el router `/api/{version}` en el TS
original). X-Request-Id se lee/genera y se devuelve siempre en la respuesta.
"""

from __future__ import annotations

from typing import Any

from dishka.integrations.litestar import FromDishka, inject
from litestar import Request, Response, post

from bkt_integration_service_python.api.schemas.issue import validate_issue_batch
from bkt_integration_service_python.core.config import Settings
from bkt_integration_service_python.core.errors import AppError
from bkt_integration_service_python.core.logging import logger
from bkt_integration_service_python.core.request_context import REQUEST_ID_HEADER, resolve_request_id
from bkt_integration_service_python.core.security import is_valid_api_key
from bkt_integration_service_python.services.issue_service import IssueService


@post(path="/api/{version:str}/issues")
@inject
async def create_issues(
    request: Request,
    data: dict[str, Any],
    version: str,
    settings: FromDishka[Settings],
    issue_service: FromDishka[IssueService],
) -> Response[dict[str, Any]]:
    if version != settings.api_version:
        raise AppError.not_found(f"Route /api/{version}/issues not found")

    provided_key = request.headers.get(settings.api_key_header)
    if not is_valid_api_key(provided_key, settings.api_key):
        raise AppError.unauthorized()

    request_id = resolve_request_id(dict(request.headers))

    body = validate_issue_batch(data)

    # Quien llama (p. ej. el trigger de Forge) y que tickets trae, registrado
    # antes de procesar para que quede constancia aunque el procesado falle.
    # Solo identificadores: nunca titulo ni descripcion.
    issue_keys = [issue.get("key") for issue in body["issues"]]
    logger.info(
        f"Issues received requestId={request_id} "
        f"initiatedBy={body['initiated_by']} issueKeys={issue_keys}"
    )

    result = await issue_service.process_issues(
        issues=body["issues"],
        initiated_by=body["initiated_by"],
        request_id=request_id,
    )

    logger.info(
        "Issues processed successfully "
        f"executionId={result['executionId']} "
        f"ticketsProcessed={result['summary']['ticketsProcessed']} "
        f"ticketsSucceeded={result['summary']['ticketsSucceeded']} "
        f"ticketsFailed={result['summary']['ticketsFailed']} "
        f"requestId={request_id} initiatedBy={body['initiated_by']} issueKeys={issue_keys}"
    )

    response_body = {
        "success": True,
        "message": "Issues accepted",
        "data": result,
    }
    return Response(content=response_body, status_code=201, headers={REQUEST_ID_HEADER: request_id})
