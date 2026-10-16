from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import get_auth_service, get_current_user
from app.core.config import Settings, get_settings
from app.core.exceptions import AuthenticationError, TooManyRequestsError
from app.core.ratelimit import LoginLimits, get_login_limits
from app.models import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from app.schemas.user import UserRead
from app.services.auth_service import AuthService, AuthSession

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
# The cookie is only ever sent to the auth endpoints, never with ordinary API calls.
REFRESH_COOKIE_PATH = "/api/auth"


def _set_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_expire_days * 86400,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )


def _auth_response(session: AuthSession, response: Response, settings: Settings) -> AuthResponse:
    _set_refresh_cookie(response, session.refresh_token, settings)
    return AuthResponse(
        user=UserRead.model_validate(session.user), access_token=session.access_token
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    response: Response,
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
):
    return _auth_response(await service.register(data), response, settings)


@router.post("/login", response_model=AuthResponse)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
    limits: LoginLimits = Depends(get_login_limits),
):
    ip = request.client.host if request.client else "unknown"
    wait = limits.retry_after(ip, data.email)
    if wait:
        raise TooManyRequestsError(
            f"Too many failed sign-in attempts. Try again in {max(1, round(wait / 60))} minute(s).",
            retry_after=wait,
        )
    try:
        session = await service.login(data)
    except AuthenticationError:
        limits.record_failure(ip, data.email)
        raise
    limits.record_success(ip, data.email)
    return _auth_response(session, response, settings)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
):
    if not refresh_token:
        raise AuthenticationError("Not signed in")
    try:
        session = await service.refresh(refresh_token)
    except AuthenticationError as exc:
        # A dead session cookie is useless; drop it so the browser stops sending it.
        error = JSONResponse(
            {"detail": exc.detail}, status_code=401, headers={"WWW-Authenticate": "Bearer"}
        )
        _clear_refresh_cookie(error, settings)
        return error
    return _auth_response(session, response, settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
):
    await service.logout(refresh_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response, settings)
    return response


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)):
    return user
