import re
import secrets
import time
from typing import Any

from argon2 import PasswordHasher

_hasher = PasswordHasher()


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
        raise ValueError("Invalid email")
    return normalized


def create_admin_account(repository: Any, email: str, password: str) -> dict[str, str]:
    if len(password) < 8:
        raise ValueError("Password must contain at least 8 characters")
    normalized = normalize_email(email)
    if repository.find_admin_by_email(normalized):
        raise ValueError("Administrator already exists")
    user_id = f"usr_web_{secrets.token_urlsafe(12)}"
    now = int(time.time() * 1000)
    repository.insert_user({"id": user_id, "createdAt": now, "updatedAt": now})
    repository.insert_admin({
        "userId": user_id,
        "role": "admin",
        "emailNormalized": normalized,
        "passwordHash": _hasher.hash(password),
        "createdAt": now,
        "updatedAt": now,
    })
    return {"userId": user_id, "email": normalized}


def reset_admin_password(repository: Any, email: str, password: str) -> dict[str, str]:
    if len(password) < 8:
        raise ValueError("Password must contain at least 8 characters")
    normalized = normalize_email(email)
    admin = repository.find_admin_by_email(normalized)
    if not admin:
        raise ValueError("Administrator not found")
    repository.update_admin_password(normalized, _hasher.hash(password), int(time.time() * 1000))
    return {"userId": str(admin["userId"]), "email": normalized}


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except Exception:
        return False
