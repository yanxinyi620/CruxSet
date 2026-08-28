from fastapi.testclient import TestClient

from app.main import app


def test_upload_image_returns_a_readable_local_media_url(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUXSET_MEDIA_DIR", str(tmp_path))
    response = TestClient(app).post(
        "/api/v1/media/images",
        files={"file": ("wall.jpg", b"\xff\xd8\xff\xe0test-image", "image/jpeg")},
    )

    assert response.status_code == 201
    media = response.json()["media"]
    assert media["url"].startswith("/api/v1/media/")
    assert TestClient(app).get(media["url"]).content == b"\xff\xd8\xff\xe0test-image"
