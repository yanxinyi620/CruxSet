import os

from starlette.requests import Request

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

_cookie_name = "cruxset_admin_session"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(os.environ.get("SESSION_SECRET", "cruxset-development-only"), salt="admin-session")


def create_session(user_id: str) -> str:
    return _serializer().dumps({"userId": user_id})


def read_session(value: str | None) -> str | None:
    if not value:
        return None
    try:
        payload = _serializer().loads(value, max_age=60 * 60 * 8)
        return str(payload["userId"])
    except (BadSignature, SignatureExpired, KeyError):
        return None


def session_cookie_name() -> str:
    return _cookie_name


def secure_cookie(request: Request | None = None) -> bool:
    # The local Caddy HTTP entry must remain usable alongside HTTPS Tunnel.
    if request is not None and request.url.scheme == "http" and request.url.hostname in {"localhost", "127.0.0.1", "::1"}:
        return False
    return os.environ.get("SESSION_COOKIE_SECURE", "true").lower() not in {"0", "false", "no"}
