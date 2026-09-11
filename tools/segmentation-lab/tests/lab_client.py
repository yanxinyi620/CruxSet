"""Explicit trusted gateway client for lab API unit tests."""
import base64
import hashlib
import hmac
import json
import time
from fastapi.testclient import TestClient as BaseClient


class TestClient(BaseClient):
    __test__ = False

    def __init__(self, app, *args, user_id="admin", is_admin=True, **kwargs):
        app.state.lab_internal_key = getattr(app.state, "lab_internal_key", "") or "test-internal-key"
        self.user_id = user_id
        self.is_admin = is_admin
        super().__init__(app, *args, **kwargs)

    def send(self, request, **kwargs):
        body = request.read()
        context = {"userId": self.user_id, "isAdmin": self.is_admin, "legacyOwnerId": "admin", "issuedAt": time.time(), "method": request.method, "path": request.url.path, "query": request.url.query.decode(), "bodySha256": hashlib.sha256(body).hexdigest()}
        encoded = base64.urlsafe_b64encode(json.dumps(context).encode()).decode().rstrip("=")
        request.headers["X-CruxSet-Lab-Context"] = encoded
        request.headers["X-CruxSet-Lab-Signature"] = hmac.new(self.app.state.lab_internal_key.encode(), encoded.encode(), hashlib.sha256).hexdigest()
        return super().send(request, **kwargs)
