from typing import Mapping
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from PIL import Image

from .adapters.base import SegmentationAdapter
from .adapters.sam2 import Sam2Adapter
from .adapters.sam3 import Sam3Adapter
from .config import Settings
from .errors import SegmentationLabError
from .experiments import ExperimentStore


def create_app(settings: Settings, adapters: Mapping[str, SegmentationAdapter] | None = None) -> FastAPI:
    app = FastAPI(title="Spraywall Segmentation Lab")
    store = ExperimentStore(settings.data_dir)

    @app.exception_handler(SegmentationLabError)
    async def segmentation_lab_error(_: Request, error: SegmentationLabError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"code": error.code, "message": error.message, "retryable": error.retryable},
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "device": settings.device, "dataDir": str(settings.data_dir)}

    active_adapters = adapters or {"sam2": Sam2Adapter(), "sam3": Sam3Adapter()}

    @app.get("/api/models")
    def models() -> dict[str, list[dict[str, object]]]:
        return {"items": [
            {"name": name, "available": availability.available, "reason": availability.reason, "device": availability.device}
            for name, adapter in active_adapters.items()
            for availability in [adapter.available()]
        ]}

    @app.post("/api/experiments", status_code=201)
    async def create_experiment(image: UploadFile = File(...)) -> dict[str, object]:
        if image.content_type not in {"image/jpeg", "image/png"}:
            raise SegmentationLabError("unsupported_image", "Upload a JPEG or PNG image")
        content = await image.read()
        try:
            decoded = Image.open(BytesIO(content))
            decoded.verify()
            decoded = Image.open(BytesIO(content))
            width, height = decoded.size
        except Exception as error:
            raise SegmentationLabError("invalid_image", "Image data could not be decoded") from error
        name = Path(image.filename or "wall.png").name
        experiment = store.create(name, sha256(content).hexdigest(), width, height)
        input_dir = store.root / experiment.id / "input"
        input_dir.mkdir(exist_ok=True)
        (input_dir / f"original{Path(name).suffix.lower()}").write_bytes(content)
        return {"id": experiment.id, "image": {"name": name, "width": width, "height": height}}

    @app.get("/")
    def workbench() -> FileResponse:
        return FileResponse(Path(__file__).parents[2] / "static" / "index.html")

    return app


app = create_app(Settings.from_env())
