import os

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


def secure_cookie() -> bool:
    return os.environ.get("SESSION_COOKIE_SECURE", "false").lower() not in {"0", "false", "no"}
