from dataclasses import dataclass
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


@dataclass(frozen=True)
class ApiError(Exception):
    code: str
    message: str
    status_code: int
    details: dict[str, Any] | None = None


async def api_error_handler(_: Request, error: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"error": {"code": error.code, "message": error.message, **({"details": error.details} if error.details is not None else {})}},
    )


async def http_error_handler(_: Request, error: StarletteHTTPException) -> JSONResponse:
    if error.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={"error": {"code": "NOT_FOUND", "message": "Resource not found"}},
        )
    return JSONResponse(
        status_code=error.status_code,
        content={"error": {"code": "HTTP_ERROR", "message": "Request failed"}},
    )
