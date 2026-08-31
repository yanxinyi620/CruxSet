from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from segmentation_lab.api import create_app
from segmentation_lab.config import Settings
from segmentation_lab.errors import SegmentationLabError
from segmentation_lab.adapters.base import ModelAvailability


def test_health_exposes_cpu_and_storage(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "device": "cpu",
        "dataDir": str(tmp_path),
    }


def test_domain_error_has_stable_json_envelope(tmp_path):
    app = create_app(Settings(data_dir=tmp_path))

    @app.get("/test-error")
    def raise_domain_error() -> None:
        raise SegmentationLabError("invalid_geometry", "Polygon must have three points")

    response = TestClient(app, raise_server_exceptions=False).get("/test-error")

    assert response.status_code == 422
    assert response.json() == {
        "code": "invalid_geometry",
        "message": "Polygon must have three points",
        "retryable": False,
    }


def test_models_reports_availability_without_starting_inference(tmp_path):
    class Adapter:
        def available(self):
            return ModelAvailability(available=False, reason="checkpoint_not_found", device="cpu")

    client = TestClient(create_app(Settings(data_dir=tmp_path), adapters={"sam3": Adapter()}))

    response = client.get("/api/models")

    assert response.json() == {"items": [{"name": "sam3", "available": False, "reason": "checkpoint_not_found", "device": "cpu"}]}


def test_upload_creates_an_experiment_with_image_metadata(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    image = BytesIO()
    Image.new("RGB", (20, 10), "white").save(image, format="PNG")

    response = client.post(
        "/api/experiments",
        files={"image": ("wall.png", image.getvalue(), "image/png")},
    )

    assert response.status_code == 201
    assert response.json()["image"] == {"name": "wall.png", "width": 20, "height": 10}


def test_root_serves_upload_workbench(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert response.status_code == 200
    assert "导入图片" in response.text


def test_upload_workbench_describes_polygon_crop_controls(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert "点击图片添加角点，拖动圆点微调" in response.text
    assert "至少选择 3 个角点" in response.text


def test_upload_workbench_uses_extension_free_image_labels(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert "function displayName(name)" in response.text
    assert "displayName(e.image.name)" in response.text


def test_sam2_crop_layers_are_normalized_to_zero(tmp_path):
    class Adapter:
        def available(self):
            return ModelAvailability(available=True, reason=None, device="cpu")

        def generate(self, *_):
            return []

    client = TestClient(create_app(Settings(data_dir=tmp_path), adapters={"sam2": Adapter()}))
    image = BytesIO()
    Image.new("RGB", (20, 10), "white").save(image, format="PNG")
    experiment_id = client.post(
        "/api/experiments",
        files={"image": ("wall.png", image.getvalue(), "image/png")},
    ).json()["id"]

    response = client.post(
        f"/api/experiments/{experiment_id}/runs",
        json={"model": "sam2", "parameters": {"crop_n_layers": 2}},
    )

    assert response.status_code == 202
    run = next(iter(client.get("/api/experiments").json()["items"][0]["runs"].values()))
    assert run["parameters"]["crop_n_layers"] == 0


def test_upload_workbench_locks_crop_layers_for_sam_models(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert "2×2 重叠分块" in response.text
    assert "function applyModelRules()" in response.text
    assert "runCrop.disabled=restricted" in response.text


def test_upload_workbench_uses_equal_width_parameter_fields(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert 'id="runFields"' in response.text
    assert "grid-template-columns:repeat(2,minmax(0,1fr))" in response.text


def test_upload_workbench_uses_leading_zero_for_threshold_defaults(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert 'id="runIou" value="0.85"' in response.text
    assert 'id="runStable" value="0.90"' in response.text


def test_opening_a_model_resets_parameters_to_the_baseline(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert 'selectedModel=model; preset("base");' in response.text


def test_segmentation_results_table_hides_task_id_column(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert "任务 ID" not in response.text
    assert 'id="runs"' in response.text


def test_calibration_results_table_hides_calibration_id_column(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert "校准 ID" not in response.text
    assert 'id="calibrations"' in response.text


def test_calibration_results_split_continue_and_export_actions(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert "<th>继续</th>" in response.text
    assert "<th>导出</th>" in response.text
    assert "<th>操作</th>" not in response.text


def test_calibration_results_offer_cruxset_publish(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")
    assert 'class="publish"' in response.text
    assert '>发布</button>' in response.text
    assert "/publish" in response.text


def test_calibration_results_use_short_calibrate_label(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")
    assert '>校准</a>' in response.text
    assert '继续校准' not in response.text


def test_model_buttons_use_publish_style_class(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")
    assert 'class="model-button"' in response.text
    assert ".model-button:hover:not(:disabled)" in response.text


def test_primary_actions_use_distinct_muted_colors(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")
    assert 'class="upload-action"' in response.text
    assert 'class="calibrate-action"' in response.text
    assert "--section-accent: #d8e0e7" in response.text
    assert "background: transparent" in response.text
    assert "background: #d5e8e2" in response.text
    assert "background: #c8dfd9" in response.text


def test_workbench_uses_modern_display_title_and_sans_interface_type(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")
    assert '--font-display: ui-sans-serif' in response.text
    assert '--font-sans: "Noto Sans SC"' in response.text
    assert "font-family: var(--font-display)" in response.text
    assert "font: 16px var(--font-sans)" in response.text
    assert 'id="publishConfirm"' in response.text
    assert 'id="publishName"' in response.text
    assert "确认发布" in response.text


def test_continue_calibration_link_includes_the_saved_result_identity(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert '/calibrations?experiment=${x.experimentId}&calibration=${x.id}' in response.text


def test_calibration_workbench_loads_a_calibration_from_url_parameters(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/calibrations")

    assert "params.get('experiment')" in response.text
    assert "resumeCalibration" in response.text


def test_calibration_workbench_keeps_only_the_save_control(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/calibrations")

    assert "保存为校准结果" in response.text
    assert "已保存校准结果" not in response.text
    assert 'id="saved"' not in response.text


def test_calibration_workbench_groups_edit_tools_and_restores_loaded_candidates(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/calibrations")

    assert "选择与删除" in response.text
    assert "新增岩点" in response.text
    assert "还原所有修改" in response.text
    assert "baselineItems" in response.text
    assert "已还原本次载入后的所有修改。" in response.text


def test_calibration_workbench_marks_add_hold_tool_with_the_active_style(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/calibrations")

    assert "function setTool(modeName)" in response.text
    assert "q('#add').classList.toggle('active',modeName==='add')" in response.text


def test_calibration_workbench_allows_adding_boundary_points_over_existing_polygons(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/calibrations")

    assert "if(mode!=='add')return;" in response.text
    assert "event.target!==overlay" not in response.text


def test_calibration_workbench_renders_large_polygons_before_smaller_holds(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/calibrations")

    assert "function polygonArea(item)" in response.text
    assert "items.slice().sort((left,right)=>polygonArea(right)-polygonArea(left))" in response.text


def test_segmentation_results_use_compact_chinese_status_labels(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert "function runStatus(run)" in response.text
    assert "运行中 · ${progress}%" in response.text
    assert 'title="${detail}"' in response.text
    assert "已完成" in response.text
    assert "失败" in response.text


def test_workbench_sorts_task_and_calibration_rows_newest_first(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/")

    assert ".sort((first, second) => (second.r.updatedAt || 0) - (first.r.updatedAt || 0));" in response.text
    assert "let calibrations = c.items.sort((first, second) => (second.updatedAt || 0) - (first.updatedAt || 0));" in response.text
