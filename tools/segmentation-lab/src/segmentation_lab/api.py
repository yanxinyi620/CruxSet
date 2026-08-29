from typing import Mapping
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from fastapi import BackgroundTasks, Body, FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from PIL import Image

from .adapters.base import SegmentationAdapter
from .adapters.sam2 import Sam2Adapter
from .adapters.sam3 import Sam3Adapter
from .config import Settings
from .errors import SegmentationLabError
from .experiments import ExperimentStore
from .service import BenchmarkService


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

    @app.get("/api/experiments")
    def experiments() -> dict[str, list[dict[str, object]]]:
        return {"items": [{"id": item["id"], "image": {"name": item["imageName"], "width": item["width"], "height": item["height"]}, "createdAt": item.get("createdAt"), "runs": item.get("runs", {})} for item in store.list_experiments()]}

    @app.get("/api/experiments/{experiment_id}/image")
    def experiment_image(experiment_id: str) -> FileResponse:
        directory = store.root / experiment_id / "input"
        matches = list(directory.glob("original.*"))
        if not matches:
            raise SegmentationLabError("experiment_not_found", "Experiment image was not found")
        return FileResponse(matches[0])

    @app.get("/results/{experiment_id}")
    def results(experiment_id: str) -> FileResponse:
        return FileResponse(Path(__file__).parents[2] / "static" / "results.html")

    @app.get("/api/experiments/{experiment_id}/candidates")
    def candidates(experiment_id: str, source: str = "sam2") -> dict[str, list[dict[str, object]]]:
        return {"items": store.list_candidates(experiment_id, source=source)}

    @app.post("/api/experiments/{experiment_id}/runs", status_code=202)
    def run(experiment_id: str, tasks: BackgroundTasks, payload: dict[str, object] = Body(default={})) -> dict[str, str]:
        item = next((entry for entry in store.list_experiments() if entry["id"] == experiment_id), None)
        if item is None:
            raise SegmentationLabError("experiment_not_found", "Experiment was not found")
        source = str(payload.get("model", "sam2"))
        parameters = payload.get("parameters", payload)
        if source not in active_adapters or not active_adapters[source].available().available:
            raise SegmentationLabError("model_unavailable", f"Model '{source}' is unavailable")
        if not isinstance(parameters, dict):
            raise SegmentationLabError("invalid_parameters", "Parameters must be an object")
        image = next((store.root / experiment_id / "input").glob("original.*"))
        store.finish_run(experiment_id, source, "running", parameters=parameters)
        tasks.add_task(BenchmarkService(store, active_adapters).run_existing, experiment_id, image, item["width"], item["height"], source, parameters)
        return {"status": "running"}

    @app.get("/")
    def workbench() -> FileResponse:
        return FileResponse(Path(__file__).parents[2] / "static" / "index.html")

    return app


app = create_app(Settings.from_env())
