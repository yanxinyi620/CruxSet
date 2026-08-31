from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from app.api.errors import ApiError
from app.auth.passwords import normalize_email, verify_password
from app.auth.rate_limit import LoginRateLimiter
from app.auth.sessions import create_session, read_session, secure_cookie, session_cookie_name

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class AdminLoginRequest(BaseModel):
    email: str
    password: str


def _repository(request: Request):
    return request.app.state.repository


def _rate_limiter(request: Request) -> LoginRateLimiter:
    return request.app.state.login_rate_limiter


def _current_admin(request: Request):
    user_id = read_session(request.cookies.get(session_cookie_name()))
    if not user_id:
        raise ApiError("AUTH_REQUIRED", "Authentication required", 401)
    user = _repository(request).find_user(user_id)
    admin = _repository(request).find_admin_by_user_id(user_id)
    if not user or not admin:
        raise ApiError("AUTH_REQUIRED", "Authentication required", 401)
    return user


def require_admin(request: Request):
    return _current_admin(request)


@router.post("/admin/login")
async def login(payload: AdminLoginRequest, request: Request, response: Response):
    try:
        normalized_email = normalize_email(payload.email)
    except ValueError:
        normalized_email = payload.email.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    limit_key = f"{client_ip}:{normalized_email}"
    limiter = _rate_limiter(request)
    if limiter.is_limited(limit_key):
        raise ApiError("RATE_LIMITED", "Too many login attempts", 429)
    admin = _repository(request).find_admin_by_email(normalized_email)
    if not admin or not verify_password(admin["passwordHash"], payload.password):
        limiter.register_failure(limit_key)
        raise ApiError("AUTH_REQUIRED", "Authentication required", 401)
    limiter.reset(limit_key)
    response.set_cookie(
        key=session_cookie_name(),
        value=create_session(str(admin["userId"])),
        httponly=True,
        secure=secure_cookie(),
        samesite="lax",
        max_age=60 * 60 * 8,
    )
    return {"user": {"id": admin["userId"], "email": normalized_email, "isAdmin": True}}


@router.get("/me")
async def me(request: Request):
    user = _current_admin(request)
    admin = _repository(request).find_admin_by_user_id(str(user["id"]))
    return {"user": {"id": user["id"], "email": admin["emailNormalized"], "isAdmin": True}}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(session_cookie_name(), secure=secure_cookie(), httponly=True, samesite="lax")
    return {"ok": True}
