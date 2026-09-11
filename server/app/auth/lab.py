"""Shared account eligibility and local lab configuration."""
import os
from fastapi import Request
from app.api.errors import ApiError


def can_use_lab(account):
    return bool(account and (account.get('role') == 'admin' or account.get('labEnabled') is True))


def lab_key(request: Request):
    return getattr(request.app.state, 'lab_internal_key', '') or getattr(request.app.state, 'segmentation_publish_key', '')


def require_same_origin(request: Request):
    origin = request.headers.get('origin')
    allowed = {str(request.base_url).rstrip('/'), os.environ.get('WEB_ORIGIN', 'http://localhost:5173').rstrip('/')}
    if not origin or origin not in allowed:
        raise ApiError('FORBIDDEN', 'Same-origin request required', 403)


def legacy_owner_id(request: Request):
    repo = request.app.state.repository
    admins = [a for a in repo.list_admin_accounts() if a.get('role') == 'admin' and repo.find_user(str(a.get('userId', '')))]
    configured = getattr(request.app.state, 'segmentation_publish_owner_id', '')
    if any(a['userId'] == configured for a in admins):
        return configured
    if not admins:
        raise ApiError('LAB_NOT_CONFIGURED', 'An administrator is required for the local lab', 503)
    return str(min(admins, key=lambda a: (int(a.get('createdAt') or 0), str(a['userId'])))['userId'])
