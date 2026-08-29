from typing import Mapping

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .adapters.base import SegmentationAdapter
from .config import Settings
from .errors import SegmentationLabError


def create_app(settings: Settings, adapters: Mapping[str, SegmentationAdapter] | None = None) -> FastAPI:
    app = FastAPI(title="Spraywall Segmentation Lab")

    @app.exception_handler(SegmentationLabError)
    async def segmentation_lab_error(_: Request, error: SegmentationLabError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"code": error.code, "message": error.message, "retryable": error.retryable},
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "device": settings.device, "dataDir": str(settings.data_dir)}

    @app.get("/api/models")
    def models() -> dict[str, list[dict[str, object]]]:
        return {"items": [
            {"name": name, "available": availability.available, "reason": availability.reason, "device": availability.device}
            for name, adapter in (adapters or {}).items()
            for availability in [adapter.available()]
        ]}

    return app
