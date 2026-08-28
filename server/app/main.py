from fastapi import FastAPI
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.errors import ApiError, api_error_handler, http_error_handler
from app.api.auth import router as auth_router
from app.api.creator import router as creator_router
from app.auth.rate_limit import LoginRateLimiter
from app.repositories.memory import MemoryRepository

app = FastAPI(title="CruxSet API", version="1.0.0")
app.state.repository = MemoryRepository()
app.state.login_rate_limiter = LoginRateLimiter()
app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.include_router(auth_router)
app.include_router(creator_router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
