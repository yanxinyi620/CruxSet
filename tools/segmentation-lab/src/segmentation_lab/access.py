"""Authenticate trusted local gateway requests; model code has no account dependency."""
import base64
import hashlib
import hmac
import json
import math
import time

from fastapi import HTTPException, Request

from .ownership import IDENTIFIER

MAX_BODY = 21 * 1024 * 1024


def _require(condition: bool) -> None:
    if not condition:
        raise ValueError("Invalid internal context")


async def authenticate(request: Request, key: str) -> dict:
    if not key:
        raise HTTPException(503, '本地实验台内部密钥未配置。')
    encoded = request.headers.get('X-CruxSet-Lab-Context', '')
    signature = request.headers.get('X-CruxSet-Lab-Signature', '')
    if not encoded or len(encoded) > 8192 or not hmac.compare_digest(
        hmac.new(key.encode(), encoded.encode(), hashlib.sha256).hexdigest(), signature
    ):
        raise HTTPException(401, '请通过主站登录后访问实验台。')
    try:
        context = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
        timestamp = float(context['issuedAt'])
        _require(math.isfinite(timestamp) and abs(time.time() - timestamp) <= 60)
        _require(isinstance(context['isAdmin'], bool))
        _require(IDENTIFIER.fullmatch(context['userId']))
        _require(IDENTIFIER.fullmatch(context['legacyOwnerId']))
        _require(context['method'] == request.method)
        _require(context['path'] == request.url.path)
        _require(context['query'] == request.scope.get('query_string', b'').decode('ascii'))
        length = request.headers.get('content-length')
        if length and int(length) > MAX_BODY:
            raise HTTPException(413, '上传内容过大。')
        chunks = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BODY:
                raise HTTPException(413, '上传内容过大。')
            chunks.append(chunk)
        # Cache the body so FastAPI can subsequently parse multipart/JSON.
        request._body = b''.join(chunks)
        _require(context['bodySha256'] == hashlib.sha256(request._body).hexdigest())
    except (ValueError, KeyError, TypeError, UnicodeError):
        raise HTTPException(401, '实验台内部请求无效或已过期。') from None
    return context
