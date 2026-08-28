from fastapi import FastAPI
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.errors import ApiError, api_error_handler, http_error_handler

app = FastAPI(title="CruxSet API", version="1.0.0")
app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
