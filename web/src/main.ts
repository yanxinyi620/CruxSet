import './styles/tokens.css'
import './styles/base.css'
import './styles/device.css'
import './styles/editor.css'
import './styles/responsive.css'
import { PreviewStore } from './preview-store.js'
import ProblemEditor from '../../miniprogram/domain/editor.js'
import type { FootRule, Grade, Hold, HoldRole } from '../../miniprogram/domain/types.js'
import { WallCanvasView } from './wall-canvas.js'
import { ROLE_COLORS } from './wall-canvas.js'
import { LocalApiClient } from './api.js'
import { DraftCanvasView } from './draft-canvas.js'
import { LayoutEditor } from '../../src/domain/layout-editor.js'
import type { DraftMode } from './draft-canvas.js'

const root = document.querySelector<HTMLElement>('#app')!
const store = new PreviewStore()
const api = new LocalApiClient()
let authenticated = false
let loginError = ''
let panel: 'home'|'drafts'|'new-wall'|'my-walls'|'my-problems'|'layout-choice'|'layout-problems' = 'home'
let choiceMode: 'browse'|'create' = 'browse'
let expandedLayout = ''
let activeLayout: { wallId: string; layoutId: string } | null = null
const thumb = '<i class="thumb"></i>'
const back = '<button class="back-button" data-back aria-label="返回">‹</button>'

const ROLE_ORDER: HoldRole[] = ['start','foot','hand','assist','finish']
const ROLE_LABELS: Record<HoldRole,string> = { start:'起步', foot:'脚点', hand:'手点', assist:'辅助', finish:'终点' }
const FOOT_RULE_LABELS: Record<FootRule,string> = { feet_follow:'手脚同点', specified:'指定脚点', all:'全墙脚点' }
const GRADES: Grade[] = ['V0','V1','V2','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12']

type EditorCtx = {
  wallId: string; layoutId: string; wallName: string; layoutName: string; angleOptions: number[]
  editor: ProblemEditor; selectedRole: HoldRole; angle: number; grade: Grade; footRule: FootRule
  name: string; description: string; undoCount: number
  canvas?: WallCanvasView; shellBuilt: boolean; saved?: string; toast?: string
}
let editorCtx: EditorCtx | null = null

type DraftCtx = {
  wallId: string; layoutId: string; wallName: string; layoutName: string
  editor: LayoutEditor; mode: DraftMode; selectedId: string | null; kind: 'hold'|'volume'
  dirty: boolean; canvas?: DraftCanvasView; toast?: string; published?: string; shellBuilt: boolean
}
let draftCtx: DraftCtx | null = null

const loginShell = () => `<div class="device"><header><small>CRUXSET</small><i></i></header><main class="login-page"><div class="login-card"><p class="eyebrow">本地创作工作台</p><h1>管理员登录</h1><p class="lead">登录后管理本机的墙面、标注与线路。</p><label>邮箱<input id="login-email" type="email" autocomplete="username" placeholder="name@example.com"></label><label>密码<input id="login-password" type="password" autocomplete="current-password" placeholder="至少 8 位"></label><button class="login-submit" data-login>登录</button><p class="login-error">${loginError}</p></div></main></div>`

const renderLogin = () => {
  root.innerHTML = loginShell()
  root.querySelector<HTMLButtonElement>('[data-login]')!.onclick = async () => {
    const email = (root.querySelector('#login-email') as HTMLInputElement).value
    const password = (root.querySelector('#login-password') as HTMLInputElement).value
    try { await api.login(email, password); await store.useApi(api); authenticated = true; loginError = ''; await render() }
    catch (error) { loginError = (error as Error).message; renderLogin() }
  }
}

const openEditor = async (wallId: string, layoutId: string) => {
  const wall = await store.session.getWall(wallId)
  const layout = await store.session.getLayout(layoutId)
  editorCtx = {
    wallId, layoutId, wallName: wall.name, layoutName: layout.name, angleOptions: wall.angleOptions,
    editor: new ProblemEditor(), selectedRole: 'hand', angle: wall.angleOptions[0] ?? 20, grade: 'V4',
    footRule: 'feet_follow', name: '', description: '', undoCount: 0, shellBuilt: false,
  }
  await render()
}

const editorShell = (ctx: EditorCtx) => `<div class="device"><header><small>CRUXSET</small><i></i></header><main>
<button class="back-button" data-editor-back aria-label="返回">‹</button>
<div class="editor-head"><h1>新建线路</h1><p>${ctx.wallName} · ${ctx.layoutName}</p></div>
<div class="field"><label>角度</label><div class="chips">${ctx.angleOptions.map(a=>`<button class="chip" data-angle="${a}">${a}°</button>`).join('')}</div></div>
<div class="field"><label>难度</label><div class="chips">${GRADES.map(g=>`<button class="chip" data-grade="${g}">${g}</button>`).join('')}</div></div>
<div class="field"><label>脚点规则</label><div class="chips">${(Object.keys(FOOT_RULE_LABELS) as FootRule[]).map(f=>`<button class="chip" data-footrule="${f}">${FOOT_RULE_LABELS[f]}</button>`).join('')}</div></div>
<div class="field"><label>在墙图上点选岩点</label><div id="editor-canvas"></div><div class="legend">${ROLE_ORDER.map(r=>`<span><i style="background:${ROLE_COLORS[r]}"></i>${ROLE_LABELS[r]}</span>`).join('')}</div></div>
<div class="role-toolbar">${ROLE_ORDER.map(r=>`<button class="role-btn" data-role="${r}"><i style="background:${ROLE_COLORS[r]}"></i>${ROLE_LABELS[r]}</button>`).join('')}</div>
<div class="editor-actions"><button data-undo>撤销</button><button data-clear>清空</button><button class="save" data-save>保存线路</button></div>
<div class="field"><label>线路名称（可选）</label><input id="editor-name" maxlength="60" placeholder="如：左侧动态"></div>
<div class="field"><label>线路说明（可选，最多 500 字）</label><textarea id="editor-desc" maxlength="500" placeholder="记录起步、关键点等"></textarea></div>
<div id="editor-toast" class="editor-toast" style="display:none"></div>
</main></div>`

const renderEditor = () => {
  const ctx = editorCtx!
  if (!ctx.shellBuilt) { ctx.shellBuilt = true; root.innerHTML = editorShell(ctx); void bindEditorEvents(ctx) }
  updateEditorUI()
}
const bindEditorEvents = async (ctx: EditorCtx) => {
  root.querySelector('[data-editor-back]')!.addEventListener('click', () => { ctx.canvas?.destroy(); editorCtx = null; void render() })
  root.querySelectorAll<HTMLElement>('[data-role]').forEach(el => el.addEventListener('click', () => { ctx.selectedRole = el.getAttribute('data-role') as HoldRole; updateEditorUI() }))
  root.querySelector('[data-undo]')!.addEventListener('click', () => { if (ctx.undoCount > 0) { ctx.editor.undo(); ctx.undoCount--; updateEditorUI() } })
  root.querySelector('[data-clear]')!.addEventListener('click', () => { if (confirm('清除所有已点岩点？')) { ctx.editor.clear(); ctx.undoCount++; updateEditorUI() } })
  root.querySelector('[data-save]')!.addEventListener('click', () => { void saveProblem() })
  root.querySelectorAll<HTMLElement>('[data-angle]').forEach(el => el.addEventListener('click', () => { ctx.angle = Number(el.getAttribute('data-angle')); updateEditorUI() }))
  root.querySelectorAll<HTMLElement>('[data-grade]').forEach(el => el.addEventListener('click', () => { ctx.grade = el.getAttribute('data-grade') as Grade; updateEditorUI() }))
  root.querySelectorAll<HTMLElement>('[data-footrule]').forEach(el => el.addEventListener('click', () => { ctx.footRule = el.getAttribute('data-footrule') as FootRule; updateEditorUI() }))
  root.querySelector('#editor-name')!.addEventListener('input', (e) => { ctx.name = (e.target as HTMLInputElement).value })
  root.querySelector('#editor-desc')!.addEventListener('input', (e) => { ctx.description = (e.target as HTMLTextAreaElement).value })
  const holder = root.querySelector('#editor-canvas')! as HTMLElement
  const layout = await store.session.getLayout(ctx.layoutId)
  ctx.canvas = new WallCanvasView(holder, {
    imageUrl: layout.imageFileId, imageWidth: layout.imageWidth, imageHeight: layout.imageHeight, holds: layout.holds,
    getAssignments: () => ctx.editor.value().holds,
    getSelectedRole: () => ctx.selectedRole,
    onTapHold: (id) => { ctx.editor.toggle(id, ctx.selectedRole); ctx.undoCount++; updateEditorUI() },
  })
}

const updateEditorUI = () => {
  const ctx = editorCtx!
  root.querySelectorAll<HTMLElement>('[data-role]').forEach(el => el.classList.toggle('active', el.getAttribute('data-role') === ctx.selectedRole))
  root.querySelectorAll<HTMLElement>('[data-angle]').forEach(el => el.classList.toggle('active', Number(el.getAttribute('data-angle')) === ctx.angle))
  root.querySelectorAll<HTMLElement>('[data-grade]').forEach(el => el.classList.toggle('active', el.getAttribute('data-grade') === ctx.grade))
  root.querySelectorAll<HTMLElement>('[data-footrule]').forEach(el => el.classList.toggle('active', el.getAttribute('data-footrule') === ctx.footRule))
  const undoBtn = root.querySelector('[data-undo]') as HTMLButtonElement
  undoBtn.disabled = ctx.undoCount === 0
  const holds = ctx.editor.value().holds
  const saveBtn = root.querySelector('[data-save]') as HTMLButtonElement
  saveBtn.disabled = !(holds.start.length >= 1 && holds.finish.length >= 1) || !!ctx.saved
  const toast = root.querySelector('#editor-toast') as HTMLElement
  toast.style.display = ctx.toast ? 'block' : 'none'
  if (ctx.toast) toast.textContent = ctx.toast
  ctx.canvas?.redraw()
}

const saveProblem = async () => {
  const ctx = editorCtx!
  const holds = ctx.editor.value().holds
  if (holds.start.length < 1 || holds.finish.length < 1) { ctx.toast = '线路需要至少一个起步和一个终点'; updateEditorUI(); return }
  try {
    const res = await store.session.createProblem(ctx.wallId, ctx.layoutId, {
      angle: ctx.angle, grade: ctx.grade, footRule: ctx.footRule, name: ctx.name || undefined, description: ctx.description || undefined, holds,
    })
    ctx.saved = res.number
    ctx.toast = `已保存线路 ${res.number}`
    updateEditorUI()
  } catch (err) {
    ctx.toast = `保存失败：${(err as Error).message}`
    updateEditorUI()
  }
}
const openDraftEditor = async (wallId: string, layoutId: string) => {
  const wall = await store.session.getWall(wallId)
  const layout = await store.session.getLayout(layoutId)
  draftCtx = {
    wallId, layoutId, wallName: wall.name, layoutName: layout.name,
    editor: new LayoutEditor(layout.holds), mode: 'add', selectedId: null, kind: 'hold',
    dirty: false, shellBuilt: false,
  }
  await render()
}

const draftEditorShell = (ctx: DraftCtx) => `<div class="device"><header><small>CRUXSET</small><i></i></header><main>
<button class="back-button" data-draft-back aria-label="返回">‹</button>
<div class="editor-head"><h1>标注草稿</h1><p>${ctx.wallName} · ${ctx.layoutName} · ${ctx.editor.value().length} 个岩点</p></div>
<div class="draft-toolbar">
<button class="draft-mode" data-mode="add">添加</button>
<button class="draft-mode" data-mode="move">移动</button>
<button class="draft-mode" data-mode="delete">删除</button>
<button data-draft-undo>撤销</button>
<button data-draft-clear>清空</button>
</div>
<div class="draft-toolbar">
<button class="draft-kind" data-kind="hold">岩点</button>
<button class="draft-kind" data-kind="volume">体积</button>
<span class="draft-hint">双指缩放 · 单指平移</span>
</div>
<div class="field"><label>在墙图上点按添加岩点；移动/删除模式点按岩点操作；空白处拖动平移，滚轮或双指缩放。</label><div id="draft-canvas"></div></div>
<div class="field" id="radius-field" style="display:none"><label>半径（选中岩点后可调整）</label><input id="hold-radius" type="range" min="0.001" max="0.08" step="0.001"></div>
<div class="editor-actions"><button data-save-draft>保存草稿</button><button class="save" data-publish-draft>发布</button></div>
<div id="draft-toast" class="editor-toast" style="display:none"></div>
</main></div>`

const renderDraftEditor = () => {
  const ctx = draftCtx!
  if (!ctx.shellBuilt) { ctx.shellBuilt = true; root.innerHTML = draftEditorShell(ctx); void bindDraftEditorEvents(ctx) }
  updateDraftEditorUI()
}

const bindDraftEditorEvents = async (ctx: DraftCtx) => {
  root.querySelector('[data-draft-back]')!.addEventListener('click', () => { ctx.canvas?.destroy(); draftCtx = null; panel = 'home'; void store.navigate({ name: 'create' }) })
  root.querySelectorAll<HTMLElement>('[data-mode]').forEach(el => el.addEventListener('click', () => { ctx.mode = el.getAttribute('data-mode') as DraftMode; ctx.selectedId = null; updateDraftEditorUI() }))
  root.querySelectorAll<HTMLElement>('[data-kind]').forEach(el => el.addEventListener('click', () => { ctx.kind = el.getAttribute('data-kind') as 'hold'|'volume'; updateDraftEditorUI() }))
  root.querySelector('[data-draft-undo]')!.addEventListener('click', () => { ctx.editor.undo(); ctx.dirty = true; ctx.selectedId = null; updateDraftEditorUI() })
  root.querySelector('[data-draft-clear]')!.addEventListener('click', () => { if (ctx.editor.value().length && confirm('清除所有已标注岩点？')) { ctx.editor = new LayoutEditor([]); ctx.dirty = true; ctx.selectedId = null; updateDraftEditorUI() } })
  root.querySelector('[data-save-draft]')!.addEventListener('click', () => { void saveDraft() })
  root.querySelector('[data-publish-draft]')!.addEventListener('click', () => { void publishDraft() })
  const radiusSlider = root.querySelector('#hold-radius') as HTMLInputElement
  let radiusActive = false
  radiusSlider.addEventListener('pointerdown', () => { radiusActive = true; ctx.editor.beginChange() })
  radiusSlider.addEventListener('input', () => { if (!ctx.selectedId) return; if (!radiusActive) { ctx.editor.beginChange(); radiusActive = true } ctx.editor.setRadius(ctx.selectedId, Number(radiusSlider.value)); ctx.dirty = true; updateDraftEditorUI() })
  radiusSlider.addEventListener('change', () => { radiusActive = false })
  const holder = root.querySelector('#draft-canvas')! as HTMLElement
  const layout = await store.session.getLayout(ctx.layoutId)
  ctx.canvas = new DraftCanvasView(holder, {
    imageUrl: layout.imageFileId, imageWidth: layout.imageWidth, imageHeight: layout.imageHeight,
    holds: ctx.editor.value(), mode: ctx.mode, selectedId: ctx.selectedId, defaultRadius: ctx.kind === 'volume' ? 0.05 : 0.018,
    onAddHold: (point) => { ctx.editor.add({ x: point[0], y: point[1], radius: ctx.kind === 'volume' ? 0.05 : 0.018, kind: ctx.kind }); ctx.dirty = true; updateDraftEditorUI() },
    onMoveStart: () => { ctx.editor.beginChange() },
    onMoveHold: (id, point) => { ctx.editor.setPosition(id, point[0], point[1]); ctx.dirty = true; ctx.canvas?.setState(ctx.editor.value(), ctx.mode, ctx.selectedId) },
    onDeleteHold: (id) => { ctx.editor.remove(id); ctx.dirty = true; ctx.selectedId = null; updateDraftEditorUI() },
    onSelectHold: (id) => { ctx.selectedId = id; updateDraftEditorUI() },
  })
}

const updateDraftEditorUI = () => {
  const ctx = draftCtx!
  root.querySelectorAll<HTMLElement>('[data-mode]').forEach(el => el.classList.toggle('active', el.getAttribute('data-mode') === ctx.mode))
  root.querySelectorAll<HTMLElement>('[data-kind]').forEach(el => el.classList.toggle('active', el.getAttribute('data-kind') === ctx.kind))
  const holds = ctx.editor.value()
  const undoBtn = root.querySelector('[data-draft-undo]') as HTMLButtonElement | null
  if (undoBtn) undoBtn.disabled = !ctx.editor.canUndo()
  const saveBtn = root.querySelector('[data-save-draft]') as HTMLButtonElement | null
  if (saveBtn) saveBtn.disabled = holds.length === 0 || !!ctx.published
  const publishBtn = root.querySelector('[data-publish-draft]') as HTMLButtonElement | null
  if (publishBtn) publishBtn.disabled = holds.length < 2 || !!ctx.published
  const toast = root.querySelector('#draft-toast') as HTMLElement | null
  if (toast) { toast.style.display = ctx.toast ? 'block' : 'none'; if (ctx.toast) toast.textContent = ctx.toast }
  const head = root.querySelector('.editor-head p') as HTMLElement | null
  if (head) head.textContent = `${ctx.wallName} · ${ctx.layoutName} · ${holds.length} 个岩点`
  const radiusField = root.querySelector('#radius-field') as HTMLElement | null
  const radiusSlider = root.querySelector('#hold-radius') as HTMLInputElement | null
  const selected = ctx.selectedId ? holds.find(h => h.id === ctx.selectedId) : null
  if (radiusField && radiusSlider) {
    radiusField.style.display = selected ? 'block' : 'none'
    if (selected) radiusSlider.value = String(selected.radius)
  }
  ctx.canvas?.setState(holds, ctx.mode, ctx.selectedId)
}

const saveDraft = async () => {
  const ctx = draftCtx!
  if (ctx.published) return
  try {
    await store.session.updateLayout(ctx.wallId, ctx.layoutId, ctx.editor.value())
    ctx.dirty = false
    ctx.toast = `草稿已保存（${ctx.editor.value().length} 个岩点）`
    updateDraftEditorUI()
  } catch (err) {
    ctx.toast = `保存失败：${(err as Error).message}`
    updateDraftEditorUI()
  }
}
const publishDraft = async () => {
  const ctx = draftCtx!
  if (ctx.published) return
  const holds = ctx.editor.value()
  if (holds.length < 2) { ctx.toast = '发布至少需要两个岩点'; updateDraftEditorUI(); return }
  try {
    const layout = await store.session.publishLayout(ctx.wallId, ctx.layoutId, holds)
    ctx.published = layout.id
    ctx.canvas?.destroy()
    draftCtx = null
    panel = 'home'
    await store.navigate({ name: 'create' })
  } catch (err) {
    ctx.toast = `发布失败：${(err as Error).message}`
    updateDraftEditorUI()
  }
}

const render = async () => {
  if (!authenticated) { renderLogin(); return }
  if (editorCtx) { renderEditor(); return }
  const route = store.state.route
  if (route.name === 'draft-editor') {
    if (!draftCtx) { await openDraftEditor(route.wallId, route.layoutId); return }
    renderDraftEditor()
    return
  }
  if (draftCtx) { draftCtx.canvas?.destroy(); draftCtx = null }
  const mine = await store.session.listMyWalls()
  const allProblems = await store.session.listProblems()
  let layoutProblemsHtml = ''
  if (panel === 'layout-problems' && activeLayout) {
    const wall = await store.session.getWall(activeLayout.wallId)
    const layout = await store.session.getLayout(activeLayout.layoutId)
    const problems = await store.session.listProblems({ wallId: activeLayout.wallId, layoutId: activeLayout.layoutId })
    layoutProblemsHtml = `${back}<h1>${wall.name}</h1><p class="lead">${layout.name} · 已发布 · 仅可查看，请到「创建」新建线路</p><h3>线路（${problems.length}）</h3>${problems.map(p=>`<article class="problem-row"><span><b>${p.number}</b><em>${p.name||'未命名线路'} · ${p.angle}° · ${p.grade}</em></span></article>`).join('')||'<p class="note">该 Layout 暂无线路</p>'}`
  }
  const published = (await Promise.all((await store.session.listWalls()).map(async wall => ({wall, layouts:(await store.session.listLayouts(wall.id)).filter(x=>x.published)})))).filter(x=>x.layouts.length)
  const drafts = (await Promise.all(mine.map(async wall => ({wall, layouts:(await store.session.listLayouts(wall.id)).filter(x=>!x.published)})))).filter(x=>x.layouts.length)
  const layoutsMine = await Promise.all(mine.map(async wall => ({wall, layouts:await store.session.listLayouts(wall.id)})))
  const tab = route.name==='create'?'create':route.name==='me'?'me':'browse'
  const chooser = `${back}<h1>${choiceMode==='create'?'选择 Layout':'选择已发布 Layout'}</h1><p class="lead">${choiceMode==='create'?'仅已发布 Layout 可用于创建线路。':'选择后查看该 Layout 的线路。'}</p>${published.flatMap(({wall,layouts})=>layouts.map(layout=>`<button class="wall-card" data-layout-id="${layout.id}" data-wall-id="${wall.id}">${thumb}<span><b>${wall.name}</b><em>${layout.name} · 已发布 · ${layout.holds.length} 个岩点</em><small>${choiceMode==='create'?'用于新建线路':'查看线路'}</small></span><strong>›</strong></button>`)).join('')}`
  const browse = panel==='layout-choice'?chooser:panel==='layout-problems'?layoutProblemsHtml:`<h1>线路</h1><p class="lead">先选一面可浏览的墙，再选择已发布 Layout 和线路。</p><h3>可浏览的墙面</h3>${published.map(({wall,layouts})=>`<button class="wall-card" data-choose="browse">${thumb}<span><b>${wall.name}</b><em>${layouts.length} 个已发布 Layout · 可浏览线路</em><small>选择 Layout</small></span><strong>›</strong></button>`).join('')||'<p class="note">暂无已发布的墙面</p>'}`
  const create = panel==='layout-choice'?chooser:panel==='new-wall'?`${back}<h1>新建墙面</h1><p class="lead">上传墙图后会创建私有墙面和一个可标注的草稿 Layout。</p><div class="field"><label>墙面名称</label><input id="wall-name" placeholder="如：日坛 Spraywall"></div><div class="field"><label>Layout 名称</label><input id="layout-name" value="首次标注"></div><div class="field"><label>墙面图片</label><input id="wall-image" type="file" accept="image/jpeg,image/png,image/webp"></div><div id="wall-create-error" class="editor-toast" style="display:none"></div><button class="hero-card" data-create-wall><span>本地保存</span><b>创建草稿墙面</b><em>草稿不会公开，也不能定线。</em></button>`:panel==='drafts'?`${back}<h1>我的草稿</h1><p class="lead">仅在这里继续标注未发布 Layout。</p>${drafts.flatMap(({wall,layouts})=>layouts.map(layout=>`<button class="mine-card" data-open-draft="${layout.id}" data-wall-id="${wall.id}">${thumb}<span><b>${wall.name}</b><em>${layout.name} · 草稿 · ${layout.holds.length} 个岩点</em><small>继续标注</small></span><mark>私有</mark></button>`)).join('')||'<p class="note">没有未发布草稿</p>'}`:`<h1>创建</h1><p class="lead">从这里新建内容，或继续完成尚未发布的墙面标注。</p><button class="hero-card" data-panel="new-wall"><span>从真实墙面开始</span><b>新建墙面</b><em>上传照片后进入首次标注；未发布前保持私有。</em></button><h3>继续创建</h3><button class="action-card" data-panel="drafts"><i>✦</i><span><b>我的草稿</b><em>${drafts.length} 面墙含未发布 Layout，仅此处可继续标注</em></span><strong>›</strong></button><button class="action-card" data-choose="create"><i>＋</i><span><b>新建线路</b><em>仅能选择已发布 Layout</em></span><strong>›</strong></button><p class="lock"><b>发布即公开并锁定：</b>发布后可浏览线路；草稿不能定线。</p>`
  const wallCards = layoutsMine.flatMap(({wall,layouts})=>layouts.map(layout=>`<article class="layout-card">${thumb}<span><b>${wall.name}</b><em>${layout.name}</em></span><small class="${layout.published?'published':'draft'}">${layout.published?'已发布':'草稿'}</small><button class="delete-button" data-delete-layout="${layout.id}" data-wall-id="${wall.id}">删除</button></article>`)).join('')
  const problemGroups = published.flatMap(({wall,layouts})=>layouts.map(layout=>{const problems=allProblems.filter(p=>p.layoutId===layout.id);const open=expandedLayout===layout.id;return `<article class="problem-group"><button class="group-head" data-expand="${layout.id}">${thumb}<span><b>${wall.name}</b><em>${layout.name} · 我创建 ${problems.length} 条线路</em></span><strong>${open?'⌃':'⌄'}</strong></button>${open?`<view class="problem-list">${problems.map(p=>`<article class="problem-row"><span><b>${p.number}</b><em>${p.name||'未命名线路'} · ${p.angle}° · ${p.grade}</em></span><button class="delete-button" data-delete-problem="${p.id}">删除</button></article>`).join('')||'<p class="note">该 Layout 下还没有你创建的线路。</p>'}</view>`:''}</article>`})).join('')
  const me = panel==='my-walls'?`${back}<h1>我的墙面</h1><p class="lead">查看所有 Layout 状态；这里仅管理和删除，不提供继续标注。</p>${wallCards}`:panel==='my-problems'?`${back}<h1>我的线路</h1><p class="lead">按已发布 Layout 查看由你创建的线路。</p>${problemGroups||'<p class="note">还没有可查看的已发布 Layout。</p>'}`:`<h1>我的</h1><p class="lead">管理自己创建的墙面与线路。</p><h3>内容管理</h3><button class="hub-card walls" data-panel="my-walls"><i>▦</i><span><small>${mine.length} 面墙</small><b>我的墙面</b><em>查看所有 Layout 状态与删除管理</em></span><strong>›</strong></button><button class="hub-card problems" data-panel="my-problems"><i>⌁</i><span><small>${allProblems.length} 条线路</small><b>我的线路</b><em>按 Layout 展开查看我创建的线路</em></span><strong>›</strong></button><p class="lock"><b>管理边界：</b>草稿只在“创建 → 我的草稿”继续标注；这里用于状态查看和删除。</p>`
  root.innerHTML=`<div class="device"><header><small>CRUXSET</small><i></i></header><main>${tab==='browse'?browse:tab==='create'?create:me}</main><nav>${['browse','create','me'].map(name=>`<button data-tab="${name}" class="${tab===name?'active':''}">${name==='browse'?'线路':name==='create'?'创建':'我的'}</button>`).join('')}</nav></div>`
  root.querySelectorAll<HTMLElement>('.layout-card').forEach(card => { const status = card.querySelector('small'), name = card.querySelector('em'); if (!status || !name) return; const row = document.createElement('div'); row.className = 'layout-meta-row'; name.parentElement?.insertBefore(row, name); row.append(status, name) })
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{panel='home';store.navigate({name:b.dataset.tab as 'browse'|'create'|'me'})})
  root.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b=>b.onclick=()=>{panel=b.dataset.panel as typeof panel;void render()})
  root.querySelectorAll<HTMLButtonElement>('[data-choose]').forEach(b=>b.onclick=()=>{choiceMode=b.dataset.choose as typeof choiceMode;panel='layout-choice';void render()})
  root.querySelectorAll<HTMLButtonElement>('[data-expand]').forEach(b=>b.onclick=()=>{expandedLayout=expandedLayout===b.dataset.expand?'':b.dataset.expand!;void render()})
  root.querySelectorAll<HTMLButtonElement>('[data-back]').forEach(b=>b.onclick=()=>{panel='home';void render()})
  root.querySelectorAll<HTMLButtonElement>('[data-layout-id]').forEach(b=>b.onclick=async()=>{const wallId=b.getAttribute('data-wall-id')!,layoutId=b.getAttribute('data-layout-id')!;if(choiceMode==='create'){await openEditor(wallId,layoutId);return}activeLayout={wallId,layoutId};panel='layout-problems';void render()})
  root.querySelectorAll<HTMLButtonElement>('[data-open-draft]').forEach(b=>b.onclick=()=>{void openDraftEditor(b.getAttribute('data-wall-id')!, b.getAttribute('data-open-draft')!)})
  root.querySelectorAll<HTMLButtonElement>('[data-delete-layout]').forEach(b=>b.onclick=async()=>{if(confirm('删除 Layout 及其关联线路？')){await store.session.deleteLayout(b.dataset.wallId!,b.dataset.deleteLayout!);void render()}})
  root.querySelectorAll<HTMLButtonElement>('[data-delete-problem]').forEach(b=>b.onclick=async()=>{if(confirm('删除这条线路？')){await store.session.deleteProblem?.(b.dataset.deleteProblem!);void render()}})
  root.querySelector<HTMLButtonElement>('[data-create-wall]')?.addEventListener('click', async () => {
    const name = (root.querySelector('#wall-name') as HTMLInputElement).value.trim()
    const layoutName = (root.querySelector('#layout-name') as HTMLInputElement).value.trim()
    const image = (root.querySelector('#wall-image') as HTMLInputElement).files?.[0]
    const error = root.querySelector('#wall-create-error') as HTMLElement
    if (!name || !layoutName || !image) { error.textContent = '请填写名称并选择图片。'; error.style.display = 'block'; return }
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => { const picture = new Image(); picture.onload = () => resolve({ width: picture.naturalWidth, height: picture.naturalHeight }); picture.onerror = reject; picture.src = URL.createObjectURL(image) })
    try { await api.createWallWithDraft({ name, layoutName, image, imageWidth: dimensions.width, imageHeight: dimensions.height }); await store.useApi(api); panel = 'drafts'; await render() }
    catch (cause) { error.textContent = (cause as Error).message; error.style.display = 'block' }
  })
}
store.subscribe(()=>void render())
void api.currentUser().then(async user => { authenticated = Boolean(user); if (user) await store.useApi(api); await render() }).catch(() => { loginError = '本地服务未启动，请先启动 FastAPI。'; void render() })
