import './styles/tokens.css'
import './styles/base.css'
import './styles/device.css'
import { PreviewStore } from './preview-store.js'

const root = document.querySelector<HTMLElement>('#app')!
const store = new PreviewStore()
let panel: 'home'|'drafts'|'my-walls'|'my-problems'|'layout-choice' = 'home'
let choiceMode: 'browse'|'create' = 'browse'
let expandedLayout = ''
const thumb = '<i class="thumb"></i>'
const back = '<button class="back-button" data-back aria-label="返回">‹</button>'

const render = async () => {
  const route = store.state.route
  const mine = await store.session.listMyWalls()
  const allProblems = await store.session.listProblems()
  const published = (await Promise.all((await store.session.listWalls()).map(async wall => ({wall, layouts:(await store.session.listLayouts(wall.id)).filter(x=>x.published)})))).filter(x=>x.layouts.length)
  const drafts = (await Promise.all(mine.map(async wall => ({wall, layouts:(await store.session.listLayouts(wall.id)).filter(x=>!x.published)})))).filter(x=>x.layouts.length)
  const layoutsMine = await Promise.all(mine.map(async wall => ({wall, layouts:await store.session.listLayouts(wall.id)})))
  const tab = route.name==='create'?'create':route.name==='me'?'me':'browse'
  const chooser = `${back}<h1>${choiceMode==='create'?'选择 Layout':'选择已发布 Layout'}</h1><p class="lead">${choiceMode==='create'?'仅已发布 Layout 可用于创建线路。':'选择后查看该 Layout 的线路。'}</p>${published.flatMap(({wall,layouts})=>layouts.map(layout=>`<button class="wall-card" data-layout-id="${layout.id}" data-wall-id="${wall.id}">${thumb}<span><b>${wall.name}</b><em>${layout.name} · 已发布 · ${layout.holds.length} 个岩点</em><small>${choiceMode==='create'?'用于新建线路':'查看线路'}</small></span><strong>›</strong></button>`)).join('')}`
  const browse = panel==='layout-choice'?chooser:`<h1>线路</h1><p class="lead">先选一面可浏览的墙，再选择已发布 Layout 和线路。</p><h3>可浏览的墙面</h3>${published.map(({wall,layouts})=>`<button class="wall-card" data-choose="browse">${thumb}<span><b>${wall.name}</b><em>${layouts.length} 个已发布 Layout · 可浏览、可定线</em><small>选择 Layout</small></span><strong>›</strong></button>`).join('')||'<p class="note">暂无已发布的墙面</p>'}`
  const create = panel==='layout-choice'?chooser:panel==='drafts'?`${back}<h1>我的草稿</h1><p class="lead">仅在这里继续标注未发布 Layout。</p>${drafts.flatMap(({wall,layouts})=>layouts.map(layout=>`<article class="mine-card">${thumb}<span><b>${wall.name}</b><em>${layout.name} · 草稿 · 可继续标注</em><small>继续标注</small></span><mark>私有</mark></article>`)).join('')||'<p class="note">没有未发布草稿</p>'}`:`<h1>创建</h1><p class="lead">从这里新建内容，或继续完成尚未发布的墙面标注。</p><button class="hero-card"><span>从真实墙面开始</span><b>新建墙面</b><em>上传照片后进入首次标注；未发布前保持私有。</em></button><h3>继续创建</h3><button class="action-card" data-panel="drafts"><i>✦</i><span><b>我的草稿</b><em>${drafts.length} 面墙含未发布 Layout，仅此处可继续标注</em></span><strong>›</strong></button><button class="action-card" data-choose="create"><i>＋</i><span><b>新建线路</b><em>仅能选择已发布 Layout</em></span><strong>›</strong></button><p class="lock"><b>发布即公开并锁定：</b>发布后可浏览、可定线；草稿不能定线。</p>`
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
  root.querySelectorAll<HTMLButtonElement>('[data-delete-layout]').forEach(b=>b.onclick=async()=>{if(confirm('删除 Layout 及其关联线路？')){await store.session.deleteLayout(b.dataset.wallId!,b.dataset.deleteLayout!);void render()}})
  root.querySelectorAll<HTMLButtonElement>('[data-delete-problem]').forEach(b=>b.onclick=async()=>{if(confirm('删除这条线路？')){await store.session.deleteProblem?.(b.dataset.deleteProblem!);void render()}})
}
store.subscribe(()=>void render());void render()
