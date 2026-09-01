from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from app.api.errors import ApiError
from app.auth.passwords import normalize_email, verify_password
from app.auth.rate_limit import LoginRateLimiter
from app.auth.sessions import create_session, read_session, secure_cookie, session_cookie_name

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class AdminLoginRequest(BaseModel):
    email: str
    password: str
class ProfileUpdate(BaseModel):
    displayName: str
class RegisterRequest(BaseModel):
    email: str
    password: str
    confirmPassword: str


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
    user = _current_admin(request)
    admin = _repository(request).find_admin_by_user_id(str(user["id"]))
    if not admin or admin.get("role") != "admin": raise ApiError("FORBIDDEN", "Administrator access required", 403)
    return user

def require_user(request: Request):
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
    account = _repository(request).find_user(str(admin["userId"])) or {}
    return {"user": {"id": admin["userId"], "email": normalized_email, "displayName": account.get("displayName", ""), "isAdmin": admin.get("role") == "admin"}}

@router.post("/register")
async def register(payload: RegisterRequest, request: Request, response: Response):
    if payload.password != payload.confirmPassword: raise ApiError("INVALID_INPUT", "Passwords do not match", 422)
    if len(payload.password) < 8: raise ApiError("INVALID_INPUT", "Password must contain at least 8 characters", 422)
    try: normalized = normalize_email(payload.email)
    except ValueError: raise ApiError("INVALID_INPUT", "Invalid email", 422)
    limiter = _rate_limiter(request); key = f"{request.client.host if request.client else 'unknown'}:{normalized}"
    if limiter.is_limited(key): raise ApiError("RATE_LIMITED", "Too many registration attempts", 429)
    if _repository(request).find_admin_by_email(normalized): limiter.register_failure(key); raise ApiError("CONFLICT", "Email already registered", 409)
    import secrets, time
    user_id = f"usr_web_{secrets.token_urlsafe(12)}"; now = int(time.time() * 1000)
    _repository(request).insert_user({"id": user_id, "createdAt": now, "updatedAt": now})
    _repository(request).insert_admin({"userId": user_id, "role": "user", "emailNormalized": normalized, "passwordHash": __import__('app.auth.passwords', fromlist=['_hasher'])._hasher.hash(payload.password), "createdAt": now, "updatedAt": now})
    response.set_cookie(key=session_cookie_name(), value=create_session(user_id), httponly=True, secure=secure_cookie(), samesite="lax", max_age=60 * 60 * 8)
    return {"user": {"id": user_id, "email": normalized, "isAdmin": False}}


@router.get("/me")
async def me(request: Request):
    user = _current_admin(request)
    admin = _repository(request).find_admin_by_user_id(str(user["id"]))
    return {"user": {"id": user["id"], "email": admin["emailNormalized"], "displayName": user.get("displayName", ""), "isAdmin": admin.get("role") == "admin"}}

@router.patch("/profile")
async def update_profile(payload: ProfileUpdate, request: Request, user=Depends(require_user)):
    name = payload.displayName.strip()
    if len(name) > 40: raise ApiError("INVALID_INPUT", "User name is too long", 422)
    updated = dict(user); updated["displayName"] = name; _repository(request).insert_user(updated)
    return {"user": {"id": user["id"], "email": _repository(request).find_admin_by_user_id(str(user["id"]))["emailNormalized"], "displayName": name, "isAdmin": True}}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(session_cookie_name(), secure=secure_cookie(), httponly=True, samesite="lax")
    return {"ok": True}
