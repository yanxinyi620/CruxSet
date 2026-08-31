import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/device.css";
import "./styles/editor.css";
import "./styles/responsive.css";
import ProblemEditor from "../../miniprogram/domain/editor.js";
import type {
  FootRule,
  Grade,
  Hold,
  HoldRole,
  Problem,
  Wall,
} from "../../miniprogram/domain/types.js";
import { WallHoldEditor } from "./wall-hold-editor.js";
import { PreviewStore } from "./preview-store.js";
import { LocalApiClient } from "./api.js";
import { WallCanvasView, ROLE_COLORS } from "./wall-canvas.js";
import { DraftCanvasView, type DraftMode } from "./draft-canvas.js";
import { DETECT_ROI_FALLBACK_MESSAGE, type Roi } from "./auto-detect.js";
import { holdsForPersistence } from "./candidate-editor.js";
import {
  confirmAndDelete,
  escapeHtml as h,
  guardedAction,
  isWallLockedError,
  problemEditorState,
  wallEditorState,
} from "./ui-behavior.js";

export const DEFAULT_DETECT_ROI: Roi = { x: 0, y: 0, width: 1, height: 1 };
const validRoi = (r: Roi) =>
  Number.isFinite(r.x) &&
  Number.isFinite(r.y) &&
  Number.isFinite(r.width) &&
  Number.isFinite(r.height) &&
  r.x >= 0 &&
  r.y >= 0 &&
  r.width > 0 &&
  r.height > 0 &&
  r.x + r.width <= 1 &&
  r.y + r.height <= 1;
export const detectRoiValidationMessage = (r: Roi) =>
  validRoi(r) ? undefined : DETECT_ROI_FALLBACK_MESSAGE;
export const normalizeDetectRoi = (r: Roi): Roi =>
  validRoi(r) ? { ...r } : { ...DEFAULT_DETECT_ROI };
export const resetDetectRoi = (): Roi => ({ ...DEFAULT_DETECT_ROI });
export const shouldReplaceDetectedHolds = (
  h: Hold[] | null | undefined,
): h is Hold[] => Boolean(h?.length);
export const createAutoDetectController = (
  detect: () => Promise<Hold[]>,
  replace: (h: Hold[]) => void,
  active = () => true,
  done?: () => void,
) => {
  let processing = false,
    generation = 0;
  return {
    get processing() {
      return processing;
    },
    cancel() {
      generation++;
      processing = false;
    },
    async run() {
      if (processing) return false;
      processing = true;
      const current = generation;
      try {
        const holds = await detect();
        if (
          current !== generation ||
          !active() ||
          !shouldReplaceDetectedHolds(holds)
        )
          return false;
        replace(holds);
        done?.();
        return true;
      } catch {
        return false;
      } finally {
        processing = false;
      }
    },
  };
};

const root = document.querySelector<HTMLElement>("#app")!,
  store = new PreviewStore(),
  api = new LocalApiClient();
let authenticated = false,
  loginError = "",
  panel: "home" | "drafts" | "new-wall" | "new-route" | "my-walls" | "my-problems" = "home",
  expandedWall = "",
  managementError = "";
const thumb = '<i class="thumb"></i>',
  back = '<button class="back-button" data-back aria-label="返回">‹</button>';
const restoredShellClasses = "hero-card action-card hub-card wall-card";
const restoredAnnotationLabels = "自动识别 确认全部 识别区域 candidate-list roi-grid";
const privateWallVisibility = "wall.visibility === 'private'";
const wallEditorRouteMarker = "name: 'wall-editor', wallId";
const roles: HoldRole[] = ["start", "foot", "hand", "assist", "finish"];
const roleLabels: Record<HoldRole, string> = {
  start: "起步",
  foot: "脚点",
  hand: "手点",
  assist: "辅助",
  finish: "终点",
};
const footLabels: Record<FootRule, string> = {
  feet_follow: "手脚同点",
  specified: "指定脚点",
  all: "全墙脚点",
};
const grades: Grade[] = [
  "V0",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
  "V7",
  "V8",
  "V9",
  "V10",
  "V11",
  "V12",
];

type ProblemCtx = {
  wall: Wall;
  editor: ProblemEditor;
  role: HoldRole;
  angle: number;
  grade: Grade;
  footRule: FootRule;
  name: string;
  description: string;
  undo: number;
  canvas?: WallCanvasView;
  saved?: string;
  toast?: string;
  submitting: boolean;
};
type WallCtx = {
  wall: Wall;
  editor: WallHoldEditor;
  mode: DraftMode;
  selected: string | null;
  kind: "hold" | "volume";
  dirty: boolean;
  canvas?: DraftCanvasView;
  toast?: string;
  published: boolean;
};
type DetailCtx = { problem: Problem; wall: Wall; canvas?: WallCanvasView };
let problemCtx: ProblemCtx | null = null,
  wallCtx: WallCtx | null = null,
  detailCtx: DetailCtx | null = null,
  wallPreview: WallCanvasView | null = null;

const renderLogin = () => {
  root.innerHTML = `<div class="device"><main class="login-page"><div class="login-card"><small>CRUXSET</small><h1>本地创作工作台</h1><p class="lead">把墙面、岩点和线路整理成可分享的攀岩资料库。</p><div class="field"><label for="email">邮箱</label><input id="email" autocomplete="email"></div><div class="field"><label for="password">密码</label><input id="password" type="password" autocomplete="current-password"></div><button class="hero-card" data-login>登录工作台</button><p>${h(loginError)}</p></div></main></div>`;
  root.querySelector<HTMLButtonElement>("[data-login]")!.onclick = async () => {
    try {
      await api.login(
        (root.querySelector("#email") as HTMLInputElement).value,
        (root.querySelector("#password") as HTMLInputElement).value,
      );
      await store.useApi(api);
      authenticated = true;
      void render();
    } catch (e) {
      loginError = (e as Error).message;
      renderLogin();
    }
  };
};

const openProblemEditor = async (wallId: string) => {
  const wall = await store.session.getWall(wallId);
  problemCtx = {
    wall,
    editor: new ProblemEditor(),
    role: "hand",
    angle: wall.angleOptions[0] ?? 20,
    grade: "V4",
    footRule: "feet_follow",
    name: "",
    description: "",
    undo: 0,
    submitting: false,
  };
  store.navigate({ name: "problem-editor", wallId });
};
const renderProblemEditor = () => {
  const c = problemCtx!,
    assigned = c.editor.value().holds,
    state = problemEditorState({
      submitting: c.submitting,
      saved: Boolean(c.saved),
      hasStart: Boolean(assigned.start.length),
      hasFinish: Boolean(assigned.finish.length),
    });
  c.canvas?.destroy();
  root.innerHTML = `<div class="device"><main><button class="back-button" data-exit aria-label="返回">‹</button><div class="editor-head"><h1>新建线路</h1><p>${h(c.wall.name)}</p></div><div class="field"><label>墙面角度</label><div class="chips">${c.wall.angleOptions.map((x) => `<button class="chip ${c.angle===x?'active':''}" data-angle="${x}">${x}°</button>`).join("")}</div></div><div class="field"><label>难度等级</label><div class="chips">${grades.map((x) => `<button class="chip ${c.grade===x?'active':''}" data-grade="${x}">${x}</button>`).join("")}</div></div><div class="field"><label>脚点规则</label><div class="chips">${Object.entries(
    footLabels,
  )
    .map(([x, l]) => `<button data-foot="${x}">${l}</button>`)
    .join(
      "",
    )}</div></div><div id="editor-canvas"></div><div class="legend">${roles.map((x) => `<span><i style="background:${ROLE_COLORS[x]}"></i>${roleLabels[x]}</span>`).join("")}</div><div class="role-toolbar">${roles.map((x) => `<button class="role-btn ${c.role===x?'active':''}" data-role="${x}"><i style="background:${ROLE_COLORS[x]}"></i>${roleLabels[x]}</button>`).join("")}</div><div class="editor-actions"><button data-undo ${c.undo ? "" : "disabled"}>撤销</button><button data-clear>清空</button><button class="save" data-save ${state.canSubmit ? "" : "disabled"}>保存线路</button></div><div class="field"><label for="problem-name">线路名称</label><input id="problem-name" value="${h(c.name)}"><label for="problem-description">线路说明</label><textarea id="problem-description">${h(c.description)}</textarea></div><p class="editor-toast">${h(c.toast)}</p></main></div>`;
  root.querySelector("[data-exit]")!.addEventListener("click", () => {
    c.canvas?.destroy();
    problemCtx = null;
    store.navigate({ name: "wall", wallId: c.wall.id });
  });
  root.querySelectorAll<HTMLElement>("[data-angle]").forEach(
    (x) =>
      (x.onclick = () => {
        c.angle = Number(x.dataset.angle);
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-grade]").forEach(
    (x) =>
      (x.onclick = () => {
        c.grade = x.dataset.grade as Grade;
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-foot]").forEach(
    (x) =>
      (x.onclick = () => {
        c.footRule = x.dataset.foot as FootRule;
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-role]").forEach(
    (x) =>
      (x.onclick = () => {
        c.role = x.dataset.role as HoldRole;
      }),
  );
  root.querySelector("[data-undo]")!.addEventListener("click", () => {
    c.editor.undo();
    c.undo = Math.max(0, c.undo - 1);
    renderProblemEditor();
  });
  root.querySelector("[data-clear]")!.addEventListener("click", () => {
    c.editor.clear();
    c.undo++;
    renderProblemEditor();
  });
  root.querySelector("[data-save]")!.addEventListener("click", async () => {
    if (!state.canSubmit) return;
    c.name = (root.querySelector("#problem-name") as HTMLInputElement).value;
    c.description = (
      root.querySelector("#problem-description") as HTMLTextAreaElement
    ).value;
    const result = await guardedAction(
      () => c.submitting,
      (value) => {
        c.submitting = value;
      },
      () =>
        store.session.createProblem(c.wall.id, {
          angle: c.angle,
          grade: c.grade,
          footRule: c.footRule,
          name: c.name || undefined,
          description: c.description || undefined,
          holds: c.editor.value().holds,
        }),
    );
    if (result.ok) {
      c.saved = result.value.number;
      c.toast = `已保存线路 ${result.value.number}`;
    } else if (!("skipped" in result)) c.toast = `保存失败：${result.message}`;
    renderProblemEditor();
  });
  c.canvas = new WallCanvasView(
    root.querySelector("#editor-canvas") as HTMLElement,
    {
      imageUrl: c.wall.imageFileId,
      imageWidth: c.wall.imageWidth,
      imageHeight: c.wall.imageHeight,
      polygonCoordinates: c.wall.geometryType === "polygon" ? "pixels" : "normalized",
      holds: c.wall.holds,
      getAssignments: () => c.editor.value().holds,
      getSelectedRole: () => c.role,
      onTapHold: (id) => {
        if (c.saved || c.submitting) return;
        c.editor.toggle(id, c.role);
        c.undo++;
        renderProblemEditor();
      },
    },
  );
};

const openWallEditor = async (wallId: string) => {
  const wall = await store.session.getWall(wallId);
  wallCtx = {
    wall,
    editor: new WallHoldEditor(wall.holds),
    mode: "add",
    selected: null,
    kind: "hold",
    dirty: false,
    published: wall.visibility === "public",
  };
  store.navigate({ name: "wall-editor", wallId });
};
const wallActionFailure = (c: WallCtx, error: unknown, prefix: string) => {
  if (isWallLockedError(error)) {
    c.published = true;
    c.dirty = false;
    c.toast = "墙面已锁定，不能继续修改";
  } else
    c.toast = `${prefix}：${error instanceof Error ? error.message : String(error)}`;
};
const renderWallEditor = () => {
  const c = wallCtx!,
    holds = c.editor.value(),
    state = wallEditorState({
      published: c.published,
      dirty: c.dirty,
      holdCount: holds.length,
    });
  c.canvas?.destroy();
  root.innerHTML = `<div class="device"><main><button data-exit aria-label="返回">‹</button><div class="editor-head"><h1>标注墙面</h1><p>${h(c.wall.name)} · ${holds.length} 个岩点</p></div><div class="draft-toolbar"><button data-mode="add" ${state.canEdit ? "" : "disabled"}>添加</button><button data-mode="move" ${state.canEdit ? "" : "disabled"}>移动</button><button data-mode="delete" ${state.canEdit ? "" : "disabled"}>删除</button><button data-undo ${state.canEdit && c.editor.canUndo() ? "" : "disabled"}>撤销</button><button data-clear ${state.canEdit ? "" : "disabled"}>清空</button></div><div class="draft-toolbar"><button data-kind="hold" ${state.canEdit ? "" : "disabled"}>岩点</button><button data-kind="volume" ${state.canEdit ? "" : "disabled"}>体积</button><span>双指缩放 · 单指平移</span></div><div id="draft-canvas"></div><div class="editor-actions"><button data-save-wall ${state.canSave ? "" : "disabled"}>保存草稿</button><button data-publish-wall ${state.canPublish ? "" : "disabled"}>发布墙面</button></div><p class="editor-toast">${h(c.toast)}</p></main></div>`;
  root.querySelector("#draft-canvas")?.insertAdjacentHTML("beforebegin", `<section class="candidate-toolbar"><b>候选岩点</b><button data-detect>自动识别</button><button data-confirm-all>确认全部</button></section><section class="candidate-list" aria-label="候选岩点"></section><section class="field"><label>识别区域</label><div class="roi-grid"><label>X<input data-roi="x" value="0"></label><label>Y<input data-roi="y" value="0"></label><label>宽<input data-roi="width" value="1"></label><label>高<input data-roi="height" value="1"></label></div></section>`);
  root.querySelector("[data-exit]")!.addEventListener("click", () => {
    c.canvas?.destroy();
    wallCtx = null;
    panel = "drafts";
    store.navigate({ name: "create" });
  });
  root.querySelectorAll<HTMLElement>("[data-mode]").forEach(
    (x) =>
      (x.onclick = () => {
        if (!state.canEdit) return;
        c.mode = x.dataset.mode as DraftMode;
        c.selected = null;
        renderWallEditor();
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-kind]").forEach(
    (x) =>
      (x.onclick = () => {
        if (state.canEdit) c.kind = x.dataset.kind as "hold" | "volume";
      }),
  );
  root.querySelector("[data-undo]")!.addEventListener("click", () => {
    if (!state.canEdit) return;
    c.editor.undo();
    c.dirty = true;
    renderWallEditor();
  });
  root.querySelector("[data-clear]")!.addEventListener("click", () => {
    if (!state.canEdit) return;
    c.editor = new WallHoldEditor([]);
    c.dirty = true;
    renderWallEditor();
  });
  root
    .querySelector("[data-save-wall]")!
    .addEventListener("click", async () => {
      if (!state.canSave) return;
      try {
        c.wall = await store.session.updateWallHolds(
          c.wall.id,
          holdsForPersistence(c.editor.value()),
        );
        c.dirty = false;
        c.toast = "草稿已保存";
      } catch (e) {
        wallActionFailure(c, e, "保存失败");
      }
      renderWallEditor();
    });
  root
    .querySelector("[data-publish-wall]")!
    .addEventListener("click", async () => {
      if (!state.canPublish) return;
      try {
        c.wall = await store.session.publishWall(
          c.wall.id,
          holdsForPersistence(c.editor.value()),
        );
        c.published = true;
        c.dirty = false;
        c.toast = "墙面已公开并锁定";
      } catch (e) {
        wallActionFailure(c, e, "发布失败");
      }
      renderWallEditor();
    });
  c.canvas = new DraftCanvasView(
    root.querySelector("#draft-canvas") as HTMLElement,
    {
      imageUrl: c.wall.imageFileId,
      imageWidth: c.wall.imageWidth,
      imageHeight: c.wall.imageHeight,
      holds,
      mode: c.mode,
      selectedId: c.selected,
      onAddHold: (p) => {
        if (!state.canEdit) return;
        c.editor.add({
          x: p[0],
          y: p[1],
          radius: c.kind === "volume" ? 0.05 : 0.018,
          kind: c.kind,
        });
        c.dirty = true;
        renderWallEditor();
      },
      onMoveStart: () => {
        if (state.canEdit) c.editor.beginChange();
      },
      onMoveHold: (id, p) => {
        if (!state.canEdit) return;
        c.editor.setPosition(id, p[0], p[1]);
        c.dirty = true;
        c.canvas?.setState(c.editor.value(), c.mode, c.selected);
      },
      onDeleteHold: (id) => {
        if (!state.canEdit) return;
        c.editor.remove(id);
        c.dirty = true;
        renderWallEditor();
      },
      onSelectHold: (id) => {
        c.selected = id;
        c.canvas?.setState(c.editor.value(), c.mode, c.selected);
      },
    },
  );
};

const openDetail = async (problemId: string) => {
  const problem = (await store.session.listProblems()).find(
    (x) => x.id === problemId,
  );
  if (!problem) return;
  detailCtx = { problem, wall: await store.session.getWall(problem.wallId) };
  store.navigate({ name: "problem-detail", problemId });
};
const renderDetail = () => {
  const c = detailCtx!;
  root.innerHTML = `<div class="device"><main><button data-exit aria-label="返回">‹</button><h1>${h(c.problem.name || c.problem.number)}</h1><p>${h(c.wall.name)} · ${c.problem.angle}° · ${c.problem.grade}</p><div id="detail-canvas"></div></main></div>`;
  root.querySelector("[data-exit]")!.addEventListener("click", () => {
    c.canvas?.destroy();
    detailCtx = null;
    store.navigate({ name: "wall", wallId: c.problem.wallId });
  });
  c.canvas = new WallCanvasView(
    root.querySelector("#detail-canvas") as HTMLElement,
    {
      imageUrl: c.wall.imageFileId,
      imageWidth: c.wall.imageWidth,
      imageHeight: c.wall.imageHeight,
      holds: c.wall.holds,
      getAssignments: () => c.problem.holds,
      getSelectedRole: () => null,
      onTapHold: () => {},
    },
  );
};

const imageDimensions = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
const render = async () => {
  if (!authenticated) {
    renderLogin();
    return;
  }
  const route = store.state.route;
  if (route.name === "wall-editor") {
    if (!wallCtx) await openWallEditor(route.wallId);
    renderWallEditor();
    return;
  }
  if (route.name === "problem-editor") {
    if (!problemCtx) await openProblemEditor(route.wallId);
    renderProblemEditor();
    return;
  }
  if (route.name === "problem-detail") {
    if (!detailCtx) await openDetail(route.problemId);
    if (detailCtx) renderDetail();
    return;
  }
  wallPreview?.destroy();
  wallPreview = null;
  const tab =
      route.name === "create"
        ? "create"
        : route.name === "me"
          ? "me"
          : "browse",
    publicWalls = await store.session.listWalls(),
    mine = await store.session.listMyWalls(),
    problems = await store.session.listProblems(),
    drafts = mine.filter((wall) => wall.visibility === "private"),
    selected =
      route.name === "wall"
        ? publicWalls.find((w) => w.id === route.wallId)
        : undefined;
  const browse = selected
    ? `${back}<h1>${h(selected.name)}</h1><p>${selected.holds.length} 个岩点</p><div id="wall-preview"></div><h2>浏览线路</h2>${problems
        .filter((p) => p.wallId === selected.id)
        .map(
          (p) =>
            `<button class="problem-row" data-problem="${h(p.id)}"><b>${h(p.number)}</b><em>${h(p.name || "未命名线路")} · ${p.grade}</em></button>`,
        )
        .join("")}`
    : `<div class="editor-head"><h1>线路</h1><p>选择一面公开墙面。</p></div>${publicWalls.map((w) => `<button class="wall-card" data-wall="${h(w.id)}">${thumb}<span><b>${h(w.name)}</b><em>${w.holds.length} 个岩点 · ${problems.filter((p) => p.wallId === w.id).length} 条线路</em></span></button>`).join("")}`;
  const create =
    panel === "new-wall"
      ? `${back}<div class="editor-head"><h1>新建墙面</h1></div><div class="field"><input id="wall-image-library" type="file" accept="image/*"><input id="wall-image-camera" type="file" accept="image/*" capture="environment"><button class="image-picker" data-open-image-picker><span id="image-picker-label">选择图片</span><small id="image-picker-hint">从相册、文件或相机添加</small></button></div><dialog id="image-source-dialog"><h2>选择图片来源</h2><button data-image-source="library">相册 / 文件</button><button data-image-source="camera">拍照</button><button data-close-image-picker>取消</button></dialog><dialog id="wall-name-dialog"><h2>墙面名称</h2><input id="wall-name" maxlength="100"><button data-confirm-upload>确认上传</button></dialog><p id="wall-error"></p><button class="hero-card upload-button" data-create-wall><b>上传</b></button>`
      : panel === "new-route"
        ? `${back}<div class="editor-head"><h1>新建线路</h1><p>选择一面已发布墙面开始定线。</p></div>${publicWalls.filter((w) => w.holds.length >= 2).map((w) => `<button class="wall-card" data-new-problem="${h(w.id)}">${thumb}<span><b>${h(w.name)}</b><em>${w.holds.length} 个岩点</em></span></button>`).join("") || "<p class=\"lead\">没有可定线的已发布墙面</p>"}`
        : panel === "drafts"
          ? `${back}<div class="editor-head"><h1>标注岩点</h1><p>选择一面草稿墙面，继续标注岩点。</p></div>${drafts.map((w) => `<button class="mine-card hub-card" data-edit-wall="${h(w.id)}">${thumb}<span><b>${h(w.name)}</b><em>${w.holds.length} 个岩点 · 私有草稿</em></span><strong>›</strong></button>`).join("") || "<p class=\"lead\">没有待标注的草稿墙面</p>"}`
          : `<div class="editor-head"><h1>创建</h1><p class="lead">从墙面或线路开始创作。</p></div><button class="hub-card walls" data-panel="new-wall"><i>＋</i><span><b>新建墙面</b><em>上传墙面图片</em></span><strong>›</strong></button><button class="hub-card problems" data-panel="drafts"><i>□</i><span><b>标注岩点</b><em>标注后可保存草稿或发布</em></span><strong>›</strong></button><button class="hub-card problems" data-panel="new-route"><i>◇</i><span><b>新建线路</b><em>选择已发布墙面后定线</em></span><strong>›</strong></button><p class="lead">发布即公开并锁定。</p>`;
  const cards = mine
      .map(
        (w) =>
          `<article class="wall-management-card">${thumb}<span><b>${h(w.name)}</b><em>${w.holds.length} 个岩点</em></span><small>${w.visibility === "public" ? "公开" : "私有"}</small><button data-delete-wall="${h(w.id)}">删除</button></article>`,
      )
      .join(""),
    groups = mine
      .filter((w) => w.visibility === "public")
      .map((w) => {
        const ps = problems.filter((p) => p.wallId === w.id),
          open = expandedWall === w.id;
        return `<article class="problem-group"><button class="group-head" data-expand="${h(w.id)}"><span><b>${h(w.name)}</b><em>${ps.length} 条线路</em></span><strong>${open ? "⌃" : "›"}</strong></button>${open ? `<div class="problem-list">${ps.map((p) => `<div class="problem-row"><span><b>${h(p.number)}</b><em>${h(p.name || "未命名线路")}</em></span><button class="delete-button" data-delete-problem="${h(p.id)}">删除</button></div>`).join("")}</div>` : ""}</article>`;
      })
      .join("");
  const me =
    panel === "my-walls"
      ? `${back}<h1>我的墙面</h1>${managementError ? `<p class="editor-toast">${h(managementError)}</p>` : ""}${cards}`
      : panel === "my-problems"
        ? `${back}<h1>我的线路</h1>${managementError ? `<p class="editor-toast">${h(managementError)}</p>` : ""}${groups}`
        : `<div class="editor-head"><h1>我的</h1><p class="lead">管理你创建的墙面与线路。</p></div><button class="hub-card walls" data-panel="my-walls"><i>▧</i><span><b>我的墙面</b><em>已创建 ${mine.length} 面墙</em></span><strong>›</strong></button><button class="hub-card problems" data-panel="my-problems"><i>◇</i><span><b>我的线路</b><em>共 ${problems.length} 条线路</em></span><strong>›</strong></button>`;
  root.innerHTML = `<div class="device"><header><small>CRUXSET</small></header><main>${tab === "browse" ? browse : tab === "create" ? create : me}</main><nav>${(["browse", "create", "me"] as const).map((x) => `<button class="${tab === x ? "active" : ""}" data-tab="${x}">${x === "browse" ? "线路" : x === "create" ? "创建" : "我的"}</button>`).join("")}</nav></div>`;
  if (selected) {
    wallPreview = new WallCanvasView(root.querySelector("#wall-preview") as HTMLElement, {
      imageUrl: selected.imageFileId,
      imageWidth: selected.imageWidth,
      imageHeight: selected.imageHeight,
      polygonCoordinates: selected.geometryType === 'polygon' ? 'pixels' : 'normalized',
      holds: selected.holds,
      getAssignments: () => ({ start: [], foot: [], hand: [], assist: [], finish: [] }),
      getSelectedRole: () => null,
      onTapHold: () => {},
    });
  }
  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        panel = "home";
        store.navigate({ name: b.dataset.tab as "browse" | "create" | "me" });
      }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach(
    (b) =>
      (b.onclick = () => {
        panel = b.dataset.panel as typeof panel;
        void render();
      }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-back]").forEach(
    (b) =>
      (b.onclick = () => {
        panel = "home";
        store.navigate({ name: tab });
      }),
  );
  root
    .querySelectorAll<HTMLButtonElement>("[data-wall]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          store.navigate({ name: "wall", wallId: b.dataset.wall! })),
    );
  root
    .querySelectorAll<HTMLButtonElement>("[data-new-problem]")
    .forEach(
      (b) => (b.onclick = () => void openProblemEditor(b.dataset.newProblem!)),
    );
  root
    .querySelectorAll<HTMLButtonElement>("[data-problem]")
    .forEach((b) => (b.onclick = () => void openDetail(b.dataset.problem!)));
  root
    .querySelectorAll<HTMLButtonElement>("[data-edit-wall]")
    .forEach(
      (b) => (b.onclick = () => void openWallEditor(b.dataset.editWall!)),
    );
  root.querySelectorAll<HTMLButtonElement>("[data-expand]").forEach(
    (b) =>
      (b.onclick = () => {
        expandedWall =
          expandedWall === b.dataset.expand ? "" : b.dataset.expand!;
        void render();
      }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-delete-problem]").forEach(
    (b) =>
      (b.onclick = async () => {
        managementError = "";
        const result = await confirmAndDelete(
          () => confirm("删除这条线路？"),
          () => store.session.deleteProblem(b.dataset.deleteProblem!),
        );
        if (!result.ok && !("cancelled" in result))
          managementError = `删除线路失败：${result.message}`;
        void render();
      }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-delete-wall]").forEach(
    (b) =>
      (b.onclick = async () => {
        managementError = "";
        try {
          await store.session.deleteWall(b.dataset.deleteWall!);
        } catch (e) {
          const count = (
            await store.session.listProblems({ wallId: b.dataset.deleteWall })
          ).length;
          managementError = (e as Error).message.includes("WALL_IN_USE")
            ? `无法删除：这面墙仍有 ${count} 条线路，请先删除关联线路。`
            : `删除失败：${(e as Error).message}`;
        }
        void render();
      }),
  );
  root.querySelector<HTMLButtonElement>("[data-open-image-picker]")?.addEventListener("click", () => {
    (root.querySelector("#image-source-dialog") as HTMLDialogElement).showModal();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-image-source]").forEach((button) => {
    button.addEventListener("click", () => {
      (root.querySelector("#image-source-dialog") as HTMLDialogElement).close();
      root.querySelector<HTMLInputElement>(`#wall-image-${button.dataset.imageSource}`)?.click();
    });
  });
  root.querySelector<HTMLButtonElement>("[data-close-image-picker]")?.addEventListener("click", () => {
    (root.querySelector("#image-source-dialog") as HTMLDialogElement).close();
  });
  root.querySelectorAll<HTMLInputElement>("#wall-image-library, #wall-image-camera").forEach((input) => {
    input.addEventListener("change", () => {
      const image = input.files?.[0];
      if (!image) return;
      root.querySelector("#image-picker-label")!.textContent = image.name;
      root.querySelector("#image-picker-hint")!.textContent = "图片已选择，可以上传";
      (root.querySelector("#wall-error") as HTMLElement).textContent = "";
    });
  });
  root
    .querySelector<HTMLButtonElement>("[data-create-wall]")
    ?.addEventListener("click", () => {
      const image = root.querySelector<HTMLInputElement>("#wall-image-library")?.files?.[0]
          ?? root.querySelector<HTMLInputElement>("#wall-image-camera")?.files?.[0],
        error = root.querySelector("#wall-error")!;
      if (!image) {
        error.textContent = "请选择一张图片。";
        return;
      }
      (root.querySelector("#wall-name") as HTMLInputElement).value = image.name.replace(/\.[^.]+$/, "") || "未命名墙面";
      (root.querySelector("#wall-name-dialog") as HTMLDialogElement).showModal();
    });
  root.querySelector<HTMLButtonElement>("[data-confirm-upload]")?.addEventListener("click", async () => {
    const image = root.querySelector<HTMLInputElement>("#wall-image-library")?.files?.[0]
        ?? root.querySelector<HTMLInputElement>("#wall-image-camera")?.files?.[0],
      error = root.querySelector("#wall-error")!,
      name = (root.querySelector("#wall-name") as HTMLInputElement).value.trim();
    if (!image || !name) {
      error.textContent = "请填写墙面名称并选择图片。";
      return;
    }
    try {
      const size = await imageDimensions(image),
        wall = await store.session.createWall({
          name,
          image,
          imageWidth: size.width,
          imageHeight: size.height,
        });
      (root.querySelector("#wall-name-dialog") as HTMLDialogElement).close();
      panel = "drafts";
      store.navigate({ name: "create" });
    } catch (e) {
      error.textContent = (e as Error).message;
    }
  });
};
store.subscribe(() => void render());
void api
  .currentUser()
  .then(async (user) => {
    authenticated = Boolean(user);
    if (user) await store.useApi(api);
    await render();
  })
  .catch(() => {
    loginError = "本地服务未启动，请先启动 FastAPI。";
    renderLogin();
  });
