import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.errors import ApiError, api_error_handler, http_error_handler
from app.api.auth import router as auth_router
from app.api.creator import router as creator_router
from app.api.media import router as media_router
from app.auth.rate_limit import LoginRateLimiter
from app.repositories.sqlite import SQLiteRepository
from app.seed import seed_demo_workspace

app = FastAPI(title="CruxSet API", version="1.0.0")
database_path = os.environ.get("CRUXSET_DATABASE_URL", str(Path(__file__).resolve().parents[1] / "data" / "cruxset.db"))
Path(database_path).parent.mkdir(parents=True, exist_ok=True)
app.state.repository = SQLiteRepository(database_path)
seed_demo_workspace(app.state.repository)
app.state.login_rate_limiter = LoginRateLimiter()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("WEB_ORIGIN", "http://localhost:5173")],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9.]+):5173$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)
app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.include_router(auth_router)
app.include_router(creator_router)
app.include_router(media_router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
