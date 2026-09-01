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
import { clearDraft, loadDraft, saveDraft } from "./draft-storage.js";
import { fromPreviewUrl, previewQuery, toPreviewUrl } from "./routes.js";
import {
  confirmAndDelete,
  confirmWallDeletion,
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
  profileEmail = "",
  panel: "home" | "profile" | "drafts" | "new-wall" | "new-route" | "my-walls" | "my-problems" = "home",
  expandedWall = "",
  managementError = "",
  routeFilterAngle: number | undefined,
  routeFilterGrade: Grade | undefined,
  selectedRouteId = "";
const initialQuery = typeof window === 'undefined' ? new URLSearchParams() : previewQuery(window.location.search);
if (initialQuery.has('panel')) panel = initialQuery.get('panel') as typeof panel;
routeFilterAngle = initialQuery.has('angle') ? Number(initialQuery.get('angle')) : undefined;
routeFilterGrade = (initialQuery.get('grade') || undefined) as Grade | undefined;
selectedRouteId = initialQuery.get('problem') || '';
const syncUiUrl = (replace = false) => {
  const route = store.state.route;
  const query: Record<string, string | number | undefined> = {};
  if ((route.name === 'create' || route.name === 'me') && panel !== 'home') query.panel = panel;
  if (route.name === 'route-browser') { query.angle = routeFilterAngle; query.grade = routeFilterGrade; query.problem = selectedRouteId; }
  if (typeof window !== 'undefined') window.history[replace ? 'replaceState' : 'pushState']({}, '', toPreviewUrl(route, query));
};
const thumb = '<i class="thumb"></i>',
  back = '<button class="back-button" data-back aria-label="返回">‹</button>';
if (typeof window !== 'undefined') window.addEventListener('popstate', () => {
  const route = fromPreviewUrl(window.location.pathname);
  const current = store.state.route;
  const isMain = (name: string) => name === 'browse' || name === 'create' || name === 'me';
  if (isMain(current.name) && !isMain(route.name)) {
    window.history.pushState({}, '', toPreviewUrl(current));
    return;
  }
  const query = previewQuery(window.location.search);
  // A main page must never be restored with a stale secondary panel entry.
  if (isMain(current.name) && route.name === current.name && query.has('panel')) {
    window.history.replaceState({}, '', toPreviewUrl(current));
    panel = 'home';
    void render();
    return;
  }
  panel = (query.get('panel') || 'home') as typeof panel;
  routeFilterAngle = query.has('angle') ? Number(query.get('angle')) : undefined;
  routeFilterGrade = (query.get('grade') || undefined) as Grade | undefined;
  selectedRouteId = query.get('problem') || '';
  if (route.name !== 'wall-editor') wallCtx = null;
  if (route.name !== 'problem-editor') problemCtx = null;
  if (route.name !== 'problem-detail') detailCtx = null;
  store.navigate(route, { silentHistory: true });
});
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
  feet_follow: "跟随手点",
  specified: "指定脚点",
  all: "全墙脚点",
};
const grades: Grade[] = Array.from({ length: 17 }, (_, index) => `V${index}` as Grade);
const routeAngles = Array.from({ length: 15 }, (_, index) => index * 5);

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
  problemId?: string;
  viewportTransform?: import("../../miniprogram/domain/types.js").ViewTransform;
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

 if (typeof root.addEventListener === "function") root.addEventListener("click", (event) => {
  root.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((dialog) => {
    if (event.target === dialog) dialog.close();
 });
});

const renderLogin = () => {
  root.innerHTML = `<div class="device"><main class="login-page"><div class="login-card"><h1>CRUXSET <span>创作工作台</span></h1><div class="field"><label for="email">邮箱</label><input id="email" autocomplete="email"></div><div class="field"><label for="password">密码</label><input id="password" type="password" autocomplete="current-password"></div><div class="login-actions"><button class="login-submit" data-login>登录</button><button class="register-submit" type="button" data-register>注册</button></div><p class="login-error">${h(loginError)}</p></div></main></div>`;
  root.querySelector<HTMLButtonElement>("[data-login]")!.onclick = async () => {
    try {
      const user = await api.login(
        (root.querySelector("#email") as HTMLInputElement).value,
        (root.querySelector("#password") as HTMLInputElement).value,
      );
      profileEmail = user.email;
      await store.useApi(api);
      authenticated = true;
      void render();
    } catch (e) {
      loginError = (e as Error).message;
      renderLogin();
    }
  };
};

const renderLoading = () => {
  root.innerHTML = `<div class="device"><main class="loading-page"><span class="loading-mark" aria-hidden="true"></span><small>CRUXSET</small><p>正在加载墙面与线路…</p></main></div>`;
};

const openProblemEditor = async (wallId: string, problemId?: string, selectedProblem?: Problem) => {
  const sourceWall = await store.session.getWall(wallId);
  const wall = { ...sourceWall, angleOptions: routeAngles };
  const existing = selectedProblem ?? (problemId ? (await store.session.listProblems()).find((item) => item.id === problemId) : undefined);
  const draftKey = `problem:${problemId ?? wallId}`;
  const saved = loadDraft<{ editor: string; role: HoldRole; angle: number; grade: Grade; footRule: FootRule; name: string; description: string }>(draftKey);
  problemCtx = {
    wall,
    editor: saved?.editor ? ProblemEditor.restore(saved.editor) : existing ? ProblemEditor.restore(JSON.stringify(existing.holds)) : new ProblemEditor(),
    role: saved?.role ?? "start",
    angle: saved?.angle ?? existing?.angle ?? (routeAngles.includes(wall.angleOptions[0] ?? 0) ? wall.angleOptions[0] ?? 0 : 0),
    grade: saved?.grade ?? existing?.grade ?? "V4",
    footRule: saved?.footRule ?? existing?.footRule ?? "feet_follow",
    name: saved?.name ?? existing?.name ?? "",
    description: saved?.description ?? existing?.description ?? "",
    undo: 0,
    submitting: false,
    problemId,
  };
  store.navigate({ name: "problem-editor", wallId, problemId });
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
  saveDraft(`problem:${c.problemId ?? c.wall.id}`, { editor: c.editor.serialize(), role: c.role, angle: c.angle, grade: c.grade, footRule: c.footRule, name: c.name, description: c.description });
  if (c.canvas) c.viewportTransform = c.canvas.getTransform();
  c.canvas?.destroy();
  root.innerHTML = `<div class="device secondary-page"><main><button class="back-button" data-exit aria-label="返回">‹</button><div class="editor-head"><h1>新建线路</h1><p>${h(c.wall.name)}</p></div><div class="route-options"><button data-choice-open="angle"><small>角度</small><b>${c.angle}°</b></button><button data-choice-open="grade"><small>难度</small><b>${c.grade}</b></button><button data-choice-open="foot"><small>脚点规则</small><b>${footLabels[c.footRule]}</b></button></div><dialog class="choice-dialog" data-choice-dialog="angle"><h2>选择角度</h2>${c.wall.angleOptions.map((x) => `<button data-choice="angle" data-value="${x}">${x}°</button>`).join("")}<button data-choice-close>关闭</button></dialog><dialog class="choice-dialog" data-choice-dialog="grade"><h2>选择难度</h2>${grades.map((x) => `<button data-choice="grade" data-value="${x}">${x}</button>`).join("")}<button data-choice-close>关闭</button></dialog><dialog class="choice-dialog" data-choice-dialog="foot"><h2>脚点规则</h2>${Object.entries(footLabels).map(([x,l]) => `<button data-choice="foot" data-value="${x}">${l}</button>`).join("")}<button data-choice-close>关闭</button></dialog><div id="editor-canvas"></div><div class="legend">${roles.map((x) => `<span><i style="background:${ROLE_COLORS[x]}"></i>${roleLabels[x]}</span>`).join("")}</div><div class="role-toolbar">${roles.map((x) => `<button class="role-btn ${c.role===x?'active':''}" data-role="${x}"><i style="background:${ROLE_COLORS[x]}"></i>${roleLabels[x]}</button>`).join("")}</div><div class="editor-actions"><button data-undo ${c.undo ? "" : "disabled"}>撤销</button><button data-clear>清空</button><button class="save" data-save ${state.canSubmit ? "" : "disabled"}>保存线路</button></div><div class="field"><label for="problem-name">线路名称</label><input id="problem-name" value="${h(c.name)}"><label for="problem-description">线路说明</label><textarea id="problem-description">${h(c.description)}</textarea></div><p class="editor-toast">${h(c.toast)}</p></main></div>`;
  root.querySelector("[data-exit]")!.addEventListener("click", () => {
    c.canvas?.destroy();
    problemCtx = null;
    clearDraft(`problem:${c.problemId ?? c.wall.id}`);
    panel = c.problemId ? "my-problems" : "new-route";
    store.navigate({ name: c.problemId ? "me" : "create" });
  });
  root.querySelector<HTMLInputElement>('#problem-name')?.addEventListener('input', (event) => {
    c.name = (event.target as HTMLInputElement).value;
    saveDraft(`problem:${c.wall.id}`, { editor: c.editor.serialize(), role: c.role, angle: c.angle, grade: c.grade, footRule: c.footRule, name: c.name, description: c.description });
  });
  root.querySelector<HTMLTextAreaElement>('#problem-description')?.addEventListener('input', (event) => {
    c.description = (event.target as HTMLTextAreaElement).value;
    saveDraft(`problem:${c.wall.id}`, { editor: c.editor.serialize(), role: c.role, angle: c.angle, grade: c.grade, footRule: c.footRule, name: c.name, description: c.description });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-choice-open]").forEach((button) => button.onclick = () => (root.querySelector(`[data-choice-dialog="${button.dataset.choiceOpen}"]`) as HTMLDialogElement).showModal());
  root.querySelectorAll<HTMLButtonElement>("[data-choice-close]").forEach((button) => button.onclick = () => (button.closest("dialog") as HTMLDialogElement).close());
  root.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach((button) => button.onclick = () => {
    if (button.dataset.choice === "angle") c.angle = Number(button.dataset.value);
    if (button.dataset.choice === "grade") c.grade = button.dataset.value as Grade;
    if (button.dataset.choice === "foot") c.footRule = button.dataset.value as FootRule;
    (button.closest("dialog") as HTMLDialogElement).close();
    renderProblemEditor();
  });
  root.querySelectorAll<HTMLElement>("[data-role]").forEach(
    (x) =>
      (x.onclick = () => {
        c.role = x.dataset.role as HoldRole;
        renderProblemEditor();
      }),
  );
  const toast = root.querySelector<HTMLParagraphElement>(".editor-toast");
  if (toast) root.querySelector("#editor-canvas")!.before(toast);
  root.querySelector("#editor-canvas")!.insertAdjacentHTML("beforebegin", `<dialog class="problem-save-dialog" id="problem-save-dialog" autocomplete="off"><h2>保存线路</h2><p class="generated-number" id="generated-problem-number"></p><label>线路名称（选填）<input id="dialog-problem-name" value="${h(c.name)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="可不填写"></label><label>线路说明（选填）<textarea id="dialog-problem-description" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="可不填写">${h(c.description)}</textarea></label><button data-confirm-problem-save>确认保存</button><button data-close-problem-save>返回</button></dialog>`);
  const saveDialog = root.querySelector<HTMLDialogElement>("#problem-save-dialog")!;
  saveDialog.tabIndex = -1;
  const generated = root.querySelector<HTMLElement>("#generated-problem-number");
  if (generated) generated.outerHTML = `<div id="problem-preview-canvas" class="problem-preview" aria-label="线路预览图"></div>`;
  root.querySelector("[data-close-problem-save]")!.addEventListener("click", () => saveDialog.close());
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
  root.querySelector("[data-save]")!.addEventListener("click", () => {
    if (!state.canSubmit) return;
    saveDialog.showModal();
    const preview = root.querySelector("#problem-preview-canvas") as HTMLElement;
    preview.replaceChildren();
    new WallCanvasView(preview, { imageUrl: c.wall.imageFileId, imageWidth: c.wall.imageWidth, imageHeight: c.wall.imageHeight, polygonCoordinates: "normalized", viewportHeight: 220, fitContain: true, holds: c.wall.holds, getAssignments: () => c.editor.value().holds, getSelectedRole: () => null, onTapHold: () => {} });
    saveDialog.focus();
  });
  root.querySelector("[data-confirm-problem-save]")!.addEventListener("click", async () => {
    if (!state.canSubmit) return;
    c.name = (root.querySelector("#dialog-problem-name") as HTMLInputElement).value.trim();
    c.description = (
      root.querySelector("#dialog-problem-description") as HTMLTextAreaElement
    ).value;
    const result = await guardedAction(
      () => c.submitting,
      (value) => {
        c.submitting = value;
      },
      () =>
        c.problemId ? (store.session as any).updateProblem(c.problemId, {
          angle: c.angle,
          grade: c.grade,
          footRule: c.footRule,
          name: c.name || undefined,
          description: c.description || undefined,
          holds: c.editor.value().holds,
        }) : store.session.createProblem(c.wall.id, {
          angle: c.angle, grade: c.grade, footRule: c.footRule, name: c.name || undefined, description: c.description || undefined, holds: c.editor.value().holds,
        }),
    );
    if (result.ok) {
      clearDraft(`problem:${c.wall.id}`);
      c.toast = `${c.problemId ? "已修改线路" : "已保存线路"} ${(result.value as Problem).number}`;
      if (c.problemId) { problemCtx = null; panel = "my-problems"; store.navigate({ name: "me" }, { replace: true }); return; }
      c.editor = new ProblemEditor();
      c.role = "start";
      c.undo = 0;
      c.name = "";
      c.description = "";
      c.saved = undefined;
    } else if (!("skipped" in result)) c.toast = `保存失败：${result.message}`;
    saveDialog.close();
    renderProblemEditor();
  });
  c.canvas = new WallCanvasView(
    root.querySelector("#editor-canvas") as HTMLElement,
    {
      imageUrl: c.wall.imageFileId,
      imageWidth: c.wall.imageWidth,
      imageHeight: c.wall.imageHeight,
      polygonCoordinates: "normalized",
      viewportHeight: 420,
      dimImage: true,
      initialTransform: c.viewportTransform,
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
  const saved = loadDraft<{ holds: Hold[]; mode: DraftMode; selected: string | null; kind: 'hold' | 'volume'; dirty: boolean }>(`wall:${wallId}`);
  wallCtx = {
    wall,
    editor: new WallHoldEditor(saved?.holds ?? wall.holds),
    mode: saved?.mode ?? "add",
    selected: saved?.selected ?? null,
    kind: saved?.kind ?? "hold",
    dirty: saved?.dirty ?? false,
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
  saveDraft(`wall:${c.wall.id}`, { holds, mode: c.mode, selected: c.selected, kind: c.kind, dirty: c.dirty });
  c.canvas?.destroy();
  root.innerHTML = `<div class="device secondary-page"><main><button class="back-button" data-exit aria-label="返回">‹</button><div class="editor-head"><h1>标注墙面</h1><p>${h(c.wall.name)} · ${holds.length} 个岩点</p></div><div class="draft-toolbar"><button data-mode="add" ${state.canEdit ? "" : "disabled"}>添加</button><button data-mode="move" ${state.canEdit ? "" : "disabled"}>移动</button><button data-mode="delete" ${state.canEdit ? "" : "disabled"}>删除</button><button data-undo ${state.canEdit && c.editor.canUndo() ? "" : "disabled"}>撤销</button><button data-clear ${state.canEdit ? "" : "disabled"}>清空</button></div><div class="draft-toolbar"><button data-kind="hold" ${state.canEdit ? "" : "disabled"}>岩点</button><button data-kind="volume" ${state.canEdit ? "" : "disabled"}>体积</button><span>双指缩放 · 单指平移</span></div><div id="draft-canvas"></div><div class="editor-actions"><button data-save-wall ${state.canSave ? "" : "disabled"}>保存草稿</button><button data-publish-wall ${state.canPublish ? "" : "disabled"}>发布墙面</button></div><p class="editor-toast">${h(c.toast)}</p></main></div>`;
  root.querySelector("#draft-canvas")?.insertAdjacentHTML("beforebegin", `<section class="candidate-toolbar"><b>候选岩点</b><button data-detect>自动识别</button><button data-confirm-all>确认全部</button></section><section class="candidate-list" aria-label="候选岩点"></section><section class="field"><label>识别区域</label><div class="roi-grid"><label>X<input data-roi="x" value="0"></label><label>Y<input data-roi="y" value="0"></label><label>宽<input data-roi="width" value="1"></label><label>高<input data-roi="height" value="1"></label></div></section>`);
  root.querySelector("[data-exit]")!.addEventListener("click", () => {
    c.canvas?.destroy();
    wallCtx = null;
    clearDraft(`wall:${c.wall.id}`);
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
        clearDraft(`wall:${c.wall.id}`);
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
        clearDraft(`wall:${c.wall.id}`);
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
  root.innerHTML = `<div class="device secondary-page"><main><button class="back-button" data-exit aria-label="返回">‹</button><h1>${h(c.problem.name || c.problem.number)}</h1><p>${h(c.wall.name)} · ${c.problem.angle}° · ${c.problem.grade}</p><div id="detail-canvas"></div><div class="legend">${roles.map((x) => `<span><i style="background:${ROLE_COLORS[x]}"></i>${roleLabels[x]}</span>`).join("")}</div></main></div>`;
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
    if (!problemCtx) await openProblemEditor(route.wallId, route.problemId);
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
    publicWalls = (await store.session.listWalls()).sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt),
    mine = (await store.session.listMyWalls()).sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt),
    problems = await store.session.listProblems(),
    drafts = mine.filter((wall) => wall.visibility === "private"),
    selected =
      route.name === "wall" || route.name === "route-browser"
        ? publicWalls.find((w) => w.id === route.wallId)
        : undefined;
  const wallProblems = selected
      ? problems.filter((p) => p.wallId === selected.id).sort((a, b) => a.number.localeCompare(b.number))
      : [],
    filteredRouteProblems = wallProblems.filter(
      (p) =>
        (routeFilterAngle === undefined || p.angle === routeFilterAngle) &&
        (routeFilterGrade === undefined || p.grade === routeFilterGrade),
    ),
    selectedRoute = filteredRouteProblems.find((p) => p.id === selectedRouteId),
    selectedRouteIndex = selectedRoute
      ? filteredRouteProblems.findIndex((p) => p.id === selectedRoute.id)
      : -1,
    routeBrowser =
      route.name === "route-browser" && selected
        ? selectedRoute
          ? `${back}<h1 class="route-detail-title">${h(selectedRoute.number)} ${h(selectedRoute.name || "")}</h1><p class="route-detail-meta">${h(selected.name)}<b>·</b>${selectedRoute.angle}°<b>·</b>${selectedRoute.grade}<b>·</b>${footLabels[selectedRoute.footRule]}</p><div id="route-preview"></div><div class="legend">${roles.map((x) => `<span><i style="background:${ROLE_COLORS[x]}"></i>${roleLabels[x]}</span>`).join("")}</div><div class="route-note">${h(selectedRoute.description || "")}</div><div class="route-pager"><button data-route-previous ${selectedRouteIndex === 0 ? "disabled" : ""}>‹ 上一条</button><button data-route-next ${selectedRouteIndex === filteredRouteProblems.length - 1 ? "disabled" : ""}>下一条 ›</button></div><button class="route-list-return" data-route-back-list>返回线路列表</button>`
          : `${back}<h1>${h(selected.name)}</h1><div class="route-browser-filters"><button data-route-angle>角度：${routeFilterAngle === undefined ? "全部" : `${routeFilterAngle}°`}</button><button data-route-grade>难度：${routeFilterGrade ?? "全部"}</button></div><dialog class="choice-dialog" data-route-filter-dialog="angle"><h2>筛选角度</h2><button data-route-filter-angle="">全部</button>${routeAngles.map((angle) => `<button data-route-filter-angle="${angle}">${angle}°</button>`).join("")}<button data-route-filter-close>关闭</button></dialog><dialog class="choice-dialog" data-route-filter-dialog="grade"><h2>筛选难度</h2><button data-route-filter-grade="">全部</button>${grades.map((grade) => `<button data-route-filter-grade="${grade}">${grade}</button>`).join("")}<button data-route-filter-close>关闭</button></dialog><div class="route-browser-list">${filteredRouteProblems.map((p) => `<button class="problem-row" data-browse-problem="${h(p.id)}"><b>${h(p.number)}</b><em>${h(p.name || "未命名线路")} · ${p.angle}° · ${p.grade}</em></button>`).join("") || '<p class="lead">没有符合筛选条件的线路</p>'}</div>`
        : "",
    browse = routeBrowser || (selected
      ? `${back}<h1>${h(selected.name)}</h1><p>${selected.holds.length} 个岩点 · ${wallProblems.length} 条线路</p><div id="wall-preview"></div><button class="hero-card route-browser-entry" data-open-route-browser><b>浏览线路</b><span>按角度、难度查找并查看线路</span></button>`
      : `<div class="editor-head"><h1>线路</h1><p>选择一面公开墙面。</p></div>${publicWalls.map((w) => `<button class="wall-card" data-wall="${h(w.id)}">${thumb}<span><b>${h(w.name)}</b><em>${w.holds.length} 个岩点 · ${problems.filter((p) => p.wallId === w.id).length} 条线路</em></span></button>`).join("")}`);
  const create =
    panel === "new-wall"
      ? `${back}<div class="editor-head"><h1>新建墙面</h1></div><div class="field"><input id="wall-image-library" type="file" accept="image/*"><input id="wall-image-camera" type="file" accept="image/*" capture="environment"><button class="image-picker" data-open-image-picker><span id="image-picker-label">选择图片</span><small id="image-picker-hint">从相册、文件或相机添加</small></button></div><dialog id="image-source-dialog"><h2>选择图片来源</h2><button data-image-source="library">相册 / 文件</button><button data-image-source="camera">拍照</button><button data-close-image-picker>取消</button></dialog><dialog id="wall-name-dialog"><label><span class="wall-name-heading">墙面名称<small>（可修改）</small></span><input id="wall-name" maxlength="100" readonly></label><button data-confirm-upload>确认上传</button></dialog><p id="wall-error"></p><button class="hero-card upload-button" data-create-wall><b>上传</b></button>`
      : panel === "new-route"
        ? `${back}<div class="editor-head"><h1>新建线路</h1><p>选择一面已发布墙面开始定线。</p></div>${publicWalls.filter((w) => w.holds.length >= 2).map((w) => `<button class="wall-card" data-new-problem="${h(w.id)}">${thumb}<span><b>${h(w.name)}</b><em>${w.holds.length} 个岩点</em></span></button>`).join("") || "<p class=\"lead\">没有可定线的已发布墙面</p>"}`
        : panel === "drafts"
          ? `${back}<div class="editor-head"><h1>标注岩点</h1><p>选择一面草稿墙面，继续标注岩点。</p></div>${drafts.map((w) => `<button class="mine-card hub-card" data-edit-wall="${h(w.id)}">${thumb}<span><b>${h(w.name)}</b><em>${w.holds.length} 个岩点 · 私有草稿</em></span><strong>›</strong></button>`).join("") || "<p class=\"lead\">没有待标注的草稿墙面</p>"}`
          : `<div class="editor-head"><h1>创建</h1><p class="lead">从墙面或线路开始创作。</p></div><button class="hub-card walls" data-panel="new-wall"><i>＋</i><span><b>新建墙面</b><em>上传墙面图片</em></span><strong>›</strong></button><button class="hub-card problems" data-panel="drafts"><i>□</i><span><b>标注岩点</b><em>标注后可保存草稿或发布</em></span><strong>›</strong></button><button class="hub-card problems" data-panel="new-route"><i>◇</i><span><b>新建线路</b><em>选择已发布墙面后定线</em></span><strong>›</strong></button><p class="lead">发布即公开并锁定。</p>`;
  const cards = mine
      .map(
        (w) =>
          `<article class="wall-management-card">${thumb}<span><b>${h(w.name)}</b><em>${w.holds.length} 个岩点</em></span><small>${w.visibility === "public" ? "公开" : "私有"}</small><button class="delete-button" data-delete-wall="${h(w.id)}">删除</button></article>`,
      )
      .join(""),
    groups = mine
      .filter((w) => w.visibility === "public")
      .map((w) => {
        const ps = problems.filter((p) => p.wallId === w.id).sort((a, b) => a.number.localeCompare(b.number)),
          open = expandedWall === w.id;
        return `<article class="problem-group"><button class="group-head" data-expand="${h(w.id)}"><span><b>${h(w.name)}</b><em>${ps.length} 条线路</em></span><strong>${open ? "⌃" : "›"}</strong></button>${open ? `<div class="problem-list">${ps.map((p) => `<div class="problem-row"><span><b>${h(p.number)}</b><em>${h(p.name || "未命名线路")}</em></span><button class="edit-button" data-edit-problem="${h(p.id)}">编辑</button><button class="delete-button" data-delete-problem="${h(p.id)}">删除</button></div>`).join("")}</div>` : ""}</article>`;
      })
      .join("");
  const me =
    panel === "profile"
      ? `${back}<div class="profile-card"><small>个人资料</small><h1>${h(profileEmail.split("@", 1)[0] || "用户")}</h1><p>${h(profileEmail)}</p></div><button class="profile-logout" data-logout>退出登录</button>`
      : panel === "my-walls"
      ? `${back}<h1>我的墙面</h1>${managementError ? `<p class="editor-toast">${h(managementError)}</p>` : ""}${cards}`
      : panel === "my-problems"
        ? `${back}<h1>我的线路</h1>${managementError ? `<p class="editor-toast">${h(managementError)}</p>` : ""}${groups}`
        : `<div class="editor-head"><h1>我的</h1><p class="lead">管理你的资料、墙面与线路。</p></div><button class="hub-card profile" data-panel="profile"><i>◎</i><span><b>个人资料</b><em>${h(profileEmail)}</em></span><strong>›</strong></button><button class="hub-card walls" data-panel="my-walls"><i>▧</i><span><b>我的墙面</b><em>已创建 ${mine.length} 面墙</em></span><strong>›</strong></button><button class="hub-card problems" data-panel="my-problems"><i>◇</i><span><b>我的线路</b><em>共 ${problems.length} 条线路</em></span><strong>›</strong></button>`;
  const isPrimaryPage = (tab === "browse" && !selected) || (tab === "create" && panel === "home") || (tab === "me" && panel === "home");
  root.innerHTML = `<div class="device ${isPrimaryPage ? "" : "secondary-page"}">${isPrimaryPage ? "<header><small>CRUXSET</small></header>" : ""}<main>${tab === "browse" ? browse : tab === "create" ? create : me}</main><nav>${(["browse", "create", "me"] as const).map((x) => `<button class="${tab === x ? "active" : ""}" data-tab="${x}">${x === "browse" ? "线路" : x === "create" ? "创建" : "我的"}</button>`).join("")}</nav></div>`;
  if (selectedRoute && route.name === "route-browser") {
    const note = root.querySelector<HTMLElement>(".route-note");
    if (note) { const setter = (selectedRoute as Problem & { setterName?: string }).setterName || profileEmail.split("@", 1)[0] || "用户"; note.innerHTML = `<b>setter by ${h(setter)}</b>${selectedRoute.description ? `<br>${h(selectedRoute.description)}` : ""}`; }
  }
  if (selected && route.name === "wall") {
    wallPreview = new WallCanvasView(root.querySelector("#wall-preview") as HTMLElement, {
      imageUrl: selected.imageFileId,
      imageWidth: selected.imageWidth,
      imageHeight: selected.imageHeight,
      polygonCoordinates: "normalized",
      viewportHeight: 400,
      holds: selected.holds,
      getAssignments: () => ({ start: [], foot: [], hand: [], assist: [], finish: [] }),
      getSelectedRole: () => null,
      onTapHold: () => {},
    });
  }
  if (selected && selectedRoute && route.name === "route-browser") {
    wallPreview = new WallCanvasView(root.querySelector("#route-preview") as HTMLElement, {
      imageUrl: selected.imageFileId,
      imageWidth: selected.imageWidth,
      imageHeight: selected.imageHeight,
      polygonCoordinates: "normalized",
      holds: selected.holds,
      getAssignments: () => selectedRoute.holds,
      getSelectedRole: () => null,
      onTapHold: () => {},
    });
  }
  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(
      (b) =>
      (b.onclick = () => {
        panel = "home";
        store.navigate({ name: b.dataset.tab as "browse" | "create" | "me" }, { replace: true });
      }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach(
    (b) =>
      (b.onclick = () => {
        panel = b.dataset.panel as typeof panel;
        syncUiUrl();
        void render();
      }),
  );
  root.querySelector<HTMLButtonElement>("[data-logout]")?.addEventListener("click", async () => {
    await api.logout();
    authenticated = false;
    profileEmail = "";
    panel = "home";
    loginError = "";
    renderLogin();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-back]").forEach(
    (b) =>
      (b.onclick = () => {
        if ((route.name === "create" || route.name === "me") && panel !== "home" && typeof window !== "undefined") {
          window.history.back();
          return;
        }
        panel = "home";
        if (route.name === "route-browser" && selectedRouteId) {
          selectedRouteId = "";
          syncUiUrl(true);
          void render();
        } else if (route.name === "route-browser" && selected)
          store.navigate({ name: "wall", wallId: selected.id }, { replace: true });
        else store.navigate({ name: tab }, { replace: true });
      }),
  );
  root
    .querySelectorAll<HTMLButtonElement>("[data-wall]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          store.navigate({ name: "wall", wallId: b.dataset.wall! })),
    );
  root.querySelector<HTMLButtonElement>("[data-open-route-browser]")?.addEventListener("click", () => {
    routeFilterAngle = undefined;
    routeFilterGrade = undefined;
    selectedRouteId = "";
    store.navigate({ name: "route-browser", wallId: selected!.id });
  });
  root.querySelector<HTMLButtonElement>("[data-route-angle]")?.addEventListener("click", () => {
    (root.querySelector('[data-route-filter-dialog="angle"]') as HTMLDialogElement).showModal();
  });
  root.querySelector<HTMLButtonElement>("[data-route-grade]")?.addEventListener("click", () => {
    (root.querySelector('[data-route-filter-dialog="grade"]') as HTMLDialogElement).showModal();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-route-filter-close]").forEach((button) => {
    button.onclick = () => (button.closest("dialog") as HTMLDialogElement).close();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-route-filter-angle]").forEach((button) => {
    button.onclick = () => {
      routeFilterAngle = button.dataset.routeFilterAngle === "" ? undefined : Number(button.dataset.routeFilterAngle);
      selectedRouteId = "";
      syncUiUrl(true);
      (button.closest("dialog") as HTMLDialogElement).close();
      void render();
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-route-filter-grade]").forEach((button) => {
    button.onclick = () => {
      routeFilterGrade = (button.dataset.routeFilterGrade || undefined) as Grade | undefined;
      selectedRouteId = "";
      syncUiUrl(true);
      (button.closest("dialog") as HTMLDialogElement).close();
      void render();
    };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-browse-problem]").forEach((button) => {
    button.onclick = () => {
      selectedRouteId = button.dataset.browseProblem!;
      syncUiUrl();
      void render();
    };
  });
  root.querySelector<HTMLButtonElement>("[data-route-back-list]")?.addEventListener("click", () => {
    selectedRouteId = "";
    syncUiUrl(true);
    void render();
  });
  root.querySelector<HTMLButtonElement>("[data-route-previous]")?.addEventListener("click", () => {
    if (selectedRouteIndex > 0) selectedRouteId = filteredRouteProblems[selectedRouteIndex - 1].id;
    syncUiUrl(true);
    void render();
  });
  root.querySelector<HTMLButtonElement>("[data-route-next]")?.addEventListener("click", () => {
    if (selectedRouteIndex >= 0 && selectedRouteIndex < filteredRouteProblems.length - 1) selectedRouteId = filteredRouteProblems[selectedRouteIndex + 1].id;
    syncUiUrl(true);
    void render();
  });
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
  root.querySelectorAll<HTMLButtonElement>("[data-edit-problem]").forEach((b) => b.onclick = () => {
    const problem = problems.find((item) => item.id === b.dataset.editProblem);
    if (problem) void openProblemEditor(problem.wallId, problem.id, problem);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-delete-wall]").forEach(
    (b) =>
      (b.onclick = async () => {
        managementError = "";
        try {
          const result = await confirmWallDeletion(
            (message) => confirm(message),
            () => store.session.deleteWall(b.dataset.deleteWall!),
          );
          if (!result.ok && !('cancelled' in result)) {
            if (result.message === 'DELETE_CANCELLED') return;
            throw new Error(result.message);
          }
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
  const wallNameDialog = root.querySelector<HTMLDialogElement>("#wall-name-dialog");
  const wallNameInput = root.querySelector<HTMLInputElement>("#wall-name");
  if (wallNameDialog && wallNameInput) {
    wallNameDialog.tabIndex = -1;
    wallNameInput.addEventListener("pointerdown", () => {
      wallNameInput.readOnly = false;
    });
  }
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
      if (!wallNameInput || !wallNameDialog) return;
      wallNameInput.value = image.name.replace(/\.[^.]+$/, "") || "未命名墙面";
      wallNameInput.readOnly = true;
      wallNameDialog.showModal();
      wallNameDialog.focus();
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
store.subscribe(() => { syncUiUrl(true); void render(); });
renderLoading();
void api
  .currentUser()
    .then(async (user) => {
      authenticated = Boolean(user);
      if (user) {
        profileEmail = user.email;
        await store.useApi(api);
      }
    await render();
  })
  .catch(() => {
    loginError = "本地服务未启动，请先启动 FastAPI。";
    renderLogin();
  });
