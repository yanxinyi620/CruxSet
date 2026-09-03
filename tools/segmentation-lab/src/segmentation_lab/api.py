from typing import Awaitable, Callable, Mapping
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import time
from uuid import uuid4

from fastapi import BackgroundTasks, Body, FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from fastapi.responses import Response
from PIL import Image

from .adapters.base import SegmentationAdapter
from .adapters.sam2 import Sam2Adapter
from .adapters.sam3 import Sam3Adapter
from .config import Settings
from .errors import SegmentationLabError
from .experiments import ExperimentStore
from .cruxset import CruxSetPublisher
from .cloudbase_sync import CloudBaseSynchronizer, sync_calibration
from .service import BenchmarkService


PostSuccessHook = Callable[[ExperimentStore, str, str, dict[str, object]], Awaitable[object] | object]


async def _run_post_success_hook(hook: PostSuccessHook, store: ExperimentStore, experiment_id: str, calibration_id: str, result: dict[str, object]) -> None:
    """Run an optional side effect without changing the completed local response."""
    try:
        outcome = hook(store, experiment_id, calibration_id, result)
        if hasattr(outcome, "__await__"):
            await outcome
    except Exception as error:
        # Hooks are explicitly best-effort. Keep their status separate from
        # the local ``publish`` receipt and never bubble the error to FastAPI.
        store.record_calibration_sync(experiment_id, calibration_id, {
            "publishRequestId": f"{experiment_id}:{calibration_id}",
            "status": "failed",
            "code": getattr(error, "code", "cloudbase_sync_failed"),
            "message": str(error),
            "retryable": bool(getattr(error, "retryable", True)),
            "updatedAt": time.time(),
        })


def create_app(settings: Settings, adapters: Mapping[str, SegmentationAdapter] | None = None, post_success_hook: PostSuccessHook | None = None) -> FastAPI:
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

    active_adapters = adapters or {"sam2": Sam2Adapter(), "sam2_tiled": Sam2Adapter(tiled=True), "sam3": Sam3Adapter()}

    if post_success_hook is None and all((settings.cloudbase_function_url, settings.cloudbase_storage_url, settings.cloudbase_signing_key, settings.cloudbase_owner_openid)):
        cloudbase = CloudBaseSynchronizer(
            settings.cloudbase_function_url,
            settings.cloudbase_signing_key,
            storage_url=settings.cloudbase_storage_url,
            owner_openid=settings.cloudbase_owner_openid,
        )

        async def configured_cloudbase_hook(store: ExperimentStore, experiment_id: str, calibration_id: str, _result: dict[str, object]) -> object:
            return await sync_calibration(store, experiment_id, calibration_id, cloudbase)

        post_success_hook = configured_cloudbase_hook

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

    @app.get("/calibrations")
    def calibration_workbench() -> FileResponse:
        return FileResponse(Path(__file__).parents[2] / "static" / "calibration.html")

    @app.get("/api/experiments/{experiment_id}/candidates")
    def candidates(experiment_id: str, source: str = "sam2") -> dict[str, list[dict[str, object]]]:
        return {"items": store.list_candidates(experiment_id, source=source)}

    @app.get("/api/experiments/{experiment_id}/calibrations")
    def calibrations(experiment_id: str) -> dict[str, list[dict[str, object]]]:
        return {"items": store.list_calibrations(experiment_id)}

    @app.get("/api/calibrations")
    def all_calibrations() -> dict[str, list[dict[str, object]]]:
        return {"items": store.all_calibrations()}

    @app.delete("/api/experiments/{experiment_id}", status_code=204)
    def delete_experiment(experiment_id: str) -> None:
        store.delete_experiment(experiment_id)

    @app.delete("/api/experiments/{experiment_id}/runs/{task_id}", status_code=204)
    def delete_run(experiment_id: str, task_id: str) -> None:
        store.delete_run(experiment_id, task_id)

    @app.delete("/api/experiments/{experiment_id}/calibrations/{calibration_id}", status_code=204)
    def delete_calibration(experiment_id: str, calibration_id: str) -> None:
        store.delete_calibration(experiment_id, calibration_id)

    @app.post("/api/experiments/{experiment_id}/calibrations", status_code=201)
    def create_calibration(experiment_id: str, payload: dict[str, object] = Body(...)) -> dict[str, object]:
        source_task_id = str(payload["sourceTaskId"])
        candidates = payload["candidates"]
        if not isinstance(candidates, list):
            raise SegmentationLabError("invalid_candidates", "Candidates must be a list")
        changes = payload.get("changes", {})
        return store.create_calibration(experiment_id, source_task_id, candidates, changes if isinstance(changes, dict) else {})

    @app.get("/api/experiments/{experiment_id}/calibrations/{calibration_id}")
    def calibration(experiment_id: str, calibration_id: str) -> dict[str, object]:
        return {"items": store.read_calibration_candidates(experiment_id, calibration_id)}

    @app.post("/api/experiments/{experiment_id}/calibrations/{calibration_id}/publish", status_code=201)
    async def publish_calibration(experiment_id: str, calibration_id: str, tasks: BackgroundTasks, payload: dict[str, object] = Body(default={})) -> dict[str, object]:
        experiment = next((item for item in store.list_experiments() if item["id"] == experiment_id), None)
        if experiment is None:
            raise SegmentationLabError("experiment_not_found", "Experiment was not found")
        calibration = next((item for item in store.list_calibrations(experiment_id) if item["id"] == calibration_id), None)
        if calibration is None:
            raise SegmentationLabError("calibration_not_found", "Calibration was not found")
        if not settings.cruxset_publish_key:
            raise SegmentationLabError("publish_not_configured", "CruxSet 发布密钥未配置。")
        image_path = next((store.root / experiment_id / "input").glob("original.*"), None)
        if image_path is None:
            raise SegmentationLabError("experiment_not_found", "Experiment image was not found")
        wall_name = str(payload.get("wallName") or f"{experiment['imageName']} · 校准 {calibration_id[:8]}")
        candidates = store.read_calibration_candidates(experiment_id, calibration_id)
        metadata = {
            "publishRequestId": str(uuid4()),
            "sourceExperimentId": experiment_id,
            "sourceCalibrationId": calibration_id,
            "wallName": wall_name,
            "imageWidth": experiment["width"],
            "imageHeight": experiment["height"],
            "holds": [{"sourceId": str(item["id"]), "kind": item.get("kind", "hold"), "polygon": item["polygon"]} for item in candidates],
        }
        result = await CruxSetPublisher(settings.cruxset_base_url, settings.cruxset_publish_key).publish(image_path.read_bytes(), str(experiment["imageName"]), metadata)
        result = {**result, "browseUrl": f"{settings.cruxset_web_url}{result.get('browsePath', '')}"}
        record = {**result, "publishRequestId": metadata["publishRequestId"], "wallName": wall_name, "publishedAt": time.time(), "status": "succeeded"}
        store.record_calibration_publish(experiment_id, calibration_id, record)
        if post_success_hook is not None:
            tasks.add_task(_run_post_success_hook, post_success_hook, store, experiment_id, calibration_id, result)
        return result

    @app.get("/api/experiments/{experiment_id}/calibrations/{calibration_id}/export.svg")
    def export_calibration_svg(experiment_id: str, calibration_id: str) -> Response:
        experiment = next((item for item in store.list_experiments() if item["id"] == experiment_id), None)
        if experiment is None:
            raise SegmentationLabError("experiment_not_found", "Experiment was not found")
        polygons = store.read_calibration_candidates(experiment_id, calibration_id)
        body = "".join(f'<polygon id="{item["id"]}" points="{" ".join(",".join(map(str, point)) for point in item["polygon"])}" />' for item in polygons)
        width, height = experiment["width"], experiment["height"]
        document = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><style>polygon{{fill:#77c94b44;stroke:#3d8b38;stroke-width:3;vector-effect:non-scaling-stroke}}</style>{body}</svg>'
        return Response(document, media_type="image/svg+xml", headers={"Content-Disposition": f'attachment; filename="{calibration_id}.svg"'})

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
        if source in {"sam2", "sam2_tiled"}:
            parameters = {**parameters, "crop_n_layers": 0}
        image = next((store.root / experiment_id / "input").glob("original.*"))
        task_id = store.start_run(experiment_id, source, parameters)
        tasks.add_task(BenchmarkService(store, active_adapters).run_existing, experiment_id, image, item["width"], item["height"], task_id, source, parameters)
        return {"status": "running", "taskId": task_id}

    @app.get("/")
    def workbench() -> FileResponse:
        return FileResponse(Path(__file__).parents[2] / "static" / "index.html")

    return app


app = create_app(Settings.from_env())
