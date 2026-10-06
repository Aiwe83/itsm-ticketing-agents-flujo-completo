from __future__ import annotations

import sys
import traceback
from http import HTTPStatus
from typing import Any

import msgspec
from litestar import MediaType, Request, Response, status_codes
from litestar.exceptions import HTTPException, TooManyRequestsException

# from loguru import Logger
from loguru import logger as loguru_logger
from msgspec.json import encode

from core.logger import get_logger, get_request_id

TRACEBACK_LIMIT = 10


def _format_traceback(exception: Exception | BaseException | None) -> str:
    if exception is None or exception.__traceback__ is None:
        return traceback.format_exc(limit=TRACEBACK_LIMIT)
    tb = traceback.extract_tb(exception.__traceback__)
    return "".join(traceback.format_list(tb[-TRACEBACK_LIMIT:]))


class CustomException(Exception):
    default_status_code = 500
    default_message = "Internal server error"

    def __init__(
        self,
        message: str | None = None,
        *,
        status_code: int | None = None,
        error: str | None = None,
        logger: Any | None = None,
        exception: Exception | None = None,
        extra: Any | None = None,
    ):
        self.status_code = status_code or self.default_status_code
        self.message = message or self.default_message
        self.error = error or type(self).__name__
        # self.extra = jsonable_encoder(extra) if extra is not None else None

        effective_exception = exception or self.__cause__
        if effective_exception is not None:
            exc_info = (
                f" - {type(effective_exception).__name__} - {str(effective_exception)}"
            )
        else:
            exc_info = ""

        if extra is not None:
            extra_info = f" {encode(extra)}"
        else:
            extra_info = ""

        active_logger = logger or loguru_logger
        active_logger.opt(depth=1).error(
            f"[{self.error}] - {message}{exc_info}{extra_info}\nTraceback:\n{_format_traceback(effective_exception)}"
        )


class ErrorResponse(msgspec.Struct, frozen=True):
    code: str
    message: str
    request_id: str | None = None
    extra: dict[str, Any] | None = None


class ApplicationError(Exception):
    status_code = status_codes.HTTP_500_INTERNAL_SERVER_ERROR
    code = "application_error"
    message = "Application error."

    def __init__(
        self,
        message: str | None = None,
        *,
        status_code: int | None = None,
        exception: BaseException | None = None,
        extra: dict[str, Any] | None = None,
        error_name: str | None = None,
    ) -> None:
        self.message = message or self.__class__.message
        self.code = error_name or self.__class__.code
        self.status_code = status_code or self.__class__.status_code
        self._exception = exception or self._resolve_active_exception()
        self.extra = extra or {}
        self._logged = False
        self._logged_exception: BaseException | None = None
        super().__init__(self.message)

        self.log_once()

    @property
    def exception(self) -> BaseException | None:
        self._sync_exception_from_context()
        return self._exception

    @property
    def error_name(self) -> str:
        return self.code

    @exception.setter
    def exception(self, value: BaseException | None) -> None:
        self._exception = value

    @staticmethod
    def _resolve_active_exception() -> BaseException | None:
        _, active_exception, _ = sys.exc_info()
        if isinstance(active_exception, BaseException):
            return active_exception
        return None

    def _sync_exception_from_context(self) -> None:
        if self._exception is not None:
            return
        if self.__cause__ is not None:
            self._exception = self.__cause__
            return
        if self.__context__ is not None and not self.__suppress_context__:
            self._exception = self.__context__

    def _get_logging_exception(self) -> BaseException | None:
        return self.exception

    def log_once(self) -> None:
        logging_exception = self._get_logging_exception()
        if self._logged and (
            self._logged_exception is not None or logging_exception is None
        ):
            return
        get_logger().opt(
            depth=1,
            exception=logging_exception,
        ).bind(**self.extra).error(
            "{code} | {message}",
            code=self.code,
            message=self.message,
        )
        self._logged = True
        self._logged_exception = logging_exception


class RuntimeLimitExceededError(ApplicationError):
    status_code = status_codes.HTTP_429_TOO_MANY_REQUESTS
    code = "runtime_limit_exceeded"
    message = "Agent runtime exceeded configured limits."


class AuthorizationError(ApplicationError):
    status_code = status_codes.HTTP_403_FORBIDDEN
    code = "forbidden"
    message = "You do not have permission to access this resource."


class ResourceNotFoundError(ApplicationError):
    status_code = status_codes.HTTP_404_NOT_FOUND
    code = "resource_not_found"
    message = "The requested resource was not found."


class ConfigurationError(ApplicationError):
    status_code = status_codes.HTTP_500_INTERNAL_SERVER_ERROR
    code = "configuration_error"
    message = "The application is not configured correctly."


def application_exception_handler(
    _: Request, exc: ApplicationError
) -> Response[ErrorResponse]:
    exc.log_once()
    payload = ErrorResponse(
        code=exc.code,
        message=exc.message,
        request_id=get_request_id(),
        extra=exc.extra,
    )
    return Response(
        content=payload,
        status_code=exc.status_code,
        media_type=MediaType.JSON,
    )


def http_exception_handler(_: Request, exc: HTTPException) -> Response[ErrorResponse]:
    code = HTTPStatus(exc.status_code).phrase.lower().replace(" ", "_")
    message = exc.detail or HTTPStatus(exc.status_code).phrase
    if isinstance(exc, TooManyRequestsException):
        code = "rate_limit_exceeded"
        message = exc.detail or "Rate limit exceeded."

    payload = ErrorResponse(code=code, message=message, request_id=get_request_id())
    return Response(
        content=payload,
        status_code=exc.status_code,
        headers=exc.headers,
        media_type=MediaType.JSON,
    )


def default_exception_handler(
    request: Request, exc: Exception
) -> Response[ErrorResponse]:
    if isinstance(exc, ApplicationError):
        return application_exception_handler(request, exc)

    get_logger().exception("Unhandled application exception")
    payload = ErrorResponse(
        code="internal_server_error",
        message="Internal server error.",
        request_id=get_request_id(),
    )
    return Response(
        content=payload,
        status_code=status_codes.HTTP_500_INTERNAL_SERVER_ERROR,
        media_type=MediaType.JSON,
    )
