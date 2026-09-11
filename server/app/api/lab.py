import base64
import hashlib
import hmac
import json
import time
from urllib.parse import urlsplit, quote

import httpx
from fastapi import APIRouter, Depends, Request, Response
from app.api.auth import require_user
from app.api.errors import ApiError
from app.auth.lab import can_use_lab, lab_key, legacy_owner_id, require_same_origin

router = APIRouter(prefix='/api/v1/segmentation-lab', tags=['segmentation-lab'])
MAX_BODY_BYTES = 21 * 1024 * 1024


@router.api_route('/{path:path}', methods=['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])
async def lab_gateway(path: str, request: Request, user=Depends(require_user)):
    account = request.app.state.repository.find_admin_by_user_id(str(user['id']))
    if not can_use_lab(account):
        raise ApiError('FORBIDDEN', 'Segmentation lab access required', 403)
    if request.method not in {'GET', 'HEAD'}:
        require_same_origin(request)
    key = lab_key(request)
    base = getattr(request.app.state, 'local_lab_url', 'http://127.0.0.1:8765')
    parsed = urlsplit(base)
    if not key or parsed.scheme != 'http' or parsed.hostname not in {'localhost', '127.0.0.1', '::1'} or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {'', '/'}:
        raise ApiError('LAB_NOT_CONFIGURED', 'Local lab gateway is not configured', 503)
    owner_id = legacy_owner_id(request)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY_BYTES:
            raise ApiError('PAYLOAD_TOO_LARGE', 'Lab upload exceeds 21 MiB', 413)
    if any(part in {'.', '..'} for part in path.split('/')):
        raise ApiError('INVALID_INPUT', 'Invalid lab path', 422)
    upstream_path = '/api/' + path
    query = request.scope.get('query_string', b'').decode('ascii')
    context = {'userId':str(user['id']), 'isAdmin':account.get('role') == 'admin', 'legacyOwnerId':owner_id, 'issuedAt':int(time.time()), 'method':request.method, 'path':upstream_path, 'query':query, 'bodySha256':hashlib.sha256(body).hexdigest()}
    encoded = base64.urlsafe_b64encode(json.dumps(context, separators=(',', ':')).encode()).rstrip(b'=').decode()
    headers = {'X-CruxSet-Lab-Context':encoded, 'X-CruxSet-Lab-Signature':hmac.new(key.encode(), encoded.encode(), hashlib.sha256).hexdigest()}
    for name in ('content-type', 'accept', 'range', 'if-none-match', 'if-modified-since'):
        if name in request.headers:
            headers[name] = request.headers[name]
    url = base.rstrip('/') + quote(upstream_path, safe='/') + ('?' + query if query else '')
    try:
        async with httpx.AsyncClient(transport=getattr(request.app.state, 'lab_transport', None), timeout=120, follow_redirects=False, trust_env=False) as client:
            upstream = await client.request(request.method, url, content=bytes(body), headers=headers)
    except httpx.RequestError as error:
        raise ApiError('LAB_UNAVAILABLE', 'Local segmentation lab is unavailable', 503) from error
    response_headers = {name:value for name,value in upstream.headers.items() if name in {'content-type', 'cache-control', 'etag', 'last-modified', 'content-disposition', 'content-range', 'accept-ranges'}}
    return Response(content=upstream.content, status_code=upstream.status_code, headers=response_headers)
