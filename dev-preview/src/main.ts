import './styles/tokens.css'
import './styles/base.css'
import './styles/device.css'
import { PreviewStore } from './preview-store.js'

const root = document.querySelector<HTMLElement>('#app')!
const store = new PreviewStore()
let panel: 'home' | 'drafts' | 'my-walls' | 'my-problems' = 'home'
const thumb = '<i class="thumb"></i>'

const render = async () => {
  const route = store.state.route
  const mine = await store.session.listMyWalls()
  const published = (await Promise.all((await store.session.listWalls()).map(async wall => ({ wall, layouts: (await store.session.listLayouts(wall.id)).filter(layout => layout.published) })))).filter(item => item.layouts.length)
  const drafts = (await Promise.all(mine.map(async wall => ({ wall, layouts: (await store.session.listLayouts(wall.id)).filter(layout => !layout.published) })))).filter(item => item.layouts.length)
  const myProblems = await store.session.listProblems()
  const tab = route.name === 'create' ? 'create' : route.name === 'me' ? 'me' : 'browse'
  const browse = panel === 'home' ? `<h1>线路</h1><p class="lead">先选一面可浏览的墙，再选择已发布 Layout 和线路。</p><h3>可浏览的墙面</h3>${published.map(({wall,layouts}) => `<button class="wall-card">${thumb}<span><b>${wall.name}</b><em>${layouts.length} 个已发布 Layout · 可浏览、可定线</em><small>选择 Layout</small></span><strong>›</strong></button>`).join('') || '<p class="note">暂无已发布的墙面</p>'}<h3>浏览规则</h3><p class="note">未发布草稿不会出现在这里。选择已发布 Layout 后，才显示线路与定线入口。</p>` : ''
  const create = panel === 'drafts' ? `<h1>我的草稿</h1><p class="lead">仅在这里继续标注未发布 Layout。</p>${drafts.map(({wall,layouts}) => layouts.map(layout => `<article class="mine-card">${thumb}<span><b>${wall.name}</b><em>${layout.name} · 草稿 · 可继续标注</em><small>继续标注</small></span><mark>私有</mark></article>`).join('')).join('') || '<p class="note">没有未发布草稿</p>'}` : `<h1>创建</h1><p class="lead">从这里新建内容，或继续完成尚未发布的墙面标注。</p><button class="hero-card"><span>从真实墙面开始</span><b>新建墙面</b><em>上传照片后进入首次标注；未发布前保持私有。</em></button><h3>继续创建</h3><button class="action-card" data-panel="drafts"><i>✦</i><span><b>我的草稿</b><em>${drafts.length} 面墙含未发布 Layout，仅此处可继续标注</em></span><strong>›</strong></button><button class="action-card"><i>＋</i><span><b>新建线路</b><em>仅能选择已发布 Layout</em></span><strong>›</strong></button><p class="lock"><b>发布即公开并锁定：</b>发布后可浏览、可定线；草稿不能定线。</p>`
  const me = panel === 'my-walls' ? `<h1>我的墙面</h1><p class="lead">查看所有 Layout 状态；这里仅管理和删除，不提供继续标注。</p>${mine.map(asyncWall => '')}${(await Promise.all(mine.map(async wall => { const layouts = await store.session.listLayouts(wall.id); return `<article class="mine-card">${thumb}<span><b>${wall.name}</b><em>${layouts.map(layout => `${layout.name} · ${layout.published ? '已发布' : '草稿'}`).join('<br>')}</em><small>查看状态 / 删除</small></span></article>` }))).join('')}</article>` : panel === 'my-problems' ? `<h1>我的线路</h1><p class="lead">仅显示由你创建的线路，可查看或删除。</p>${myProblems.map(problem => `<article class="wall-card"><span><b>${problem.number} · ${problem.name || '未命名线路'}</b><em>${problem.angle}° · ${problem.grade} · 可删除</em></span><strong>›</strong></article>`).join('') || '<p class="note">还没有创建线路</p>'}` : `<h1>我的</h1><p class="lead">管理自己创建的墙面与线路。</p><button class="hub-card walls" data-panel="my-walls"><span><b>我的墙面</b><em>${mine.length} 面墙 · 查看所有 Layout 状态与删除管理</em></span><strong>›</strong></button><button class="hub-card problems" data-panel="my-problems"><span><b>我的线路</b><em>${myProblems.length} 条线路 · 仅显示我创建的线路</em></span><strong>›</strong></button>`
  root.innerHTML = `<div class="device"><header><small>CRUXSET</small><i></i></header><main>${tab === 'browse' ? browse : tab === 'create' ? create : me}</main><nav>${['browse','create','me'].map(name => `<button data-tab="${name}" class="${tab === name ? 'active' : ''}">${name === 'browse' ? '线路' : name === 'create' ? '创建' : '我的'}</button>`).join('')}</nav></div>`
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.onclick = () => { panel = 'home'; store.navigate({ name: button.dataset.tab as 'browse' | 'create' | 'me' }) })
  root.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button => button.onclick = () => { panel = button.dataset.panel as typeof panel; void render() })
}
store.subscribe(() => { void render() })
void render()
