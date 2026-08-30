# Segmentation Lab 重叠岩点选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让人工校准页的大体积绘制在底层、小岩点绘制在上层，并在重叠处默认选中小岩点。

**Architecture:** SVG 的后绘制元素位于上层且优先接收点击。保留现有基于 `polygonArea` 的排序与原生点击事件，只将候选 polygon 的渲染顺序改为按面积降序，使小 polygon 最后写入 SVG。

**Tech Stack:** FastAPI 静态页面、原生 JavaScript、SVG、pytest。

---

### Task 1: 修正校准页的 SVG 层叠顺序

**Files:**
- Modify: `tools/segmentation-lab/tests/test_api.py:211-217`
- Modify: `tools/segmentation-lab/static/calibration.html:18`

- [ ] **Step 1: 先写出失败的回归测试**

将现有测试替换为下列断言，以声明大 polygon 必须先于小 polygon 渲染：

```python
def test_calibration_workbench_renders_large_polygons_before_smaller_holds(tmp_path):
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/calibrations")

    assert "function polygonArea(item)" in response.text
    assert "items.slice().sort((left,right)=>polygonArea(right)-polygonArea(left))" in response.text
```

- [ ] **Step 2: 运行该测试，确认它因当前升序排序而失败**

Run: `uv run --extra test pytest tools/segmentation-lab/tests/test_api.py::test_calibration_workbench_renders_large_polygons_before_smaller_holds -q`

Expected: FAIL，响应中仍只有 `polygonArea(left)-polygonArea(right)`。

- [ ] **Step 3: 实施最小代码修改**

在 `tools/segmentation-lab/static/calibration.html` 的 `render()` 中，将排序表达式替换为：

```javascript
items.slice().sort((left,right)=>polygonArea(right)-polygonArea(left))
```

保持 `polygonArea`、`polygon` 的生成顺序和点击处理逻辑不变。

- [ ] **Step 4: 重新运行该测试，确认它通过**

Run: `uv run --extra test pytest tools/segmentation-lab/tests/test_api.py::test_calibration_workbench_renders_large_polygons_before_smaller_holds -q`

Expected: PASS。

- [ ] **Step 5: 运行完整 Segmentation Lab 测试套件**

Run: `uv run --extra test pytest tools/segmentation-lab/tests -q`

Expected: 所有测试通过。

- [ ] **Step 6: 提交代码与测试**

```bash
git add tools/segmentation-lab/static/calibration.html tools/segmentation-lab/tests/test_api.py
git commit -m "fix: select smaller holds above volumes"
```
