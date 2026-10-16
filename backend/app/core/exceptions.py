from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Domain error carrying the HTTP status it should surface as."""

    status_code = 400

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class AuthenticationError(AppError):
    status_code = 401


class ForbiddenError(AppError):
    status_code = 403


class NotFoundError(AppError):
    status_code = 404


class ConflictError(AppError):
    status_code = 409


class PayloadTooLargeError(AppError):
    status_code = 413


class TooManyRequestsError(AppError):
    status_code = 429

    def __init__(self, detail: str, retry_after: int) -> None:
        super().__init__(detail)
        self.retry_after = retry_after


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        headers: dict[str, str] | None = None
        if isinstance(exc, AuthenticationError):
            headers = {"WWW-Authenticate": "Bearer"}
        elif isinstance(exc, TooManyRequestsError):
            headers = {"Retry-After": str(exc.retry_after)}
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=headers)
