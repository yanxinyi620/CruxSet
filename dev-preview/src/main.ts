import './styles/tokens.css'
import './styles/base.css'
import { PreviewStore } from './preview-store.js'

const root = document.querySelector<HTMLElement>('#app')!
const store = new PreviewStore()

const render = async () => {
  const route = store.state.route
  const walls = await store.session.listWalls()
  const mine = await store.session.listMyWalls()
  const tab = route.name === 'create' ? 'create' : route.name === 'me' ? 'me' : 'browse'
  const thumb = '<i class="thumb"></i>'
  const browse = `<h1>线路</h1><p class="lead">先选一面可浏览的墙，再选择 Layout 和线路。</p><h3>可浏览的墙面</h3>${walls.map(wall => `<button class="wall-card" data-wall="${wall.id}">${thumb}<span><b>${wall.name}</b><em>35° · 24 个岩点 · 公开</em><small>2 个已发布 Layout</small></span><strong>›</strong></button>`).join('') || '<p>暂无公开墙面</p>'}<h3>浏览规则</h3><p class="note">进入墙面后选择 Layout，才显示搜索、按编号和随机线路。</p>`
  const create = `<h1>创建</h1><p class="lead">从这里开始新建内容，或继续完成尚未发布的墙面标注。</p><button class="hero-card" data-new-wall><span>从真实墙面开始</span><b>新建墙面</b><em>上传照片、设置可见范围，然后立即进入首次标注。</em></button><h3>继续创建</h3><button class="action-card"><i>✦</i><span><b>我的草稿</b><em>继续标注未发布的墙面与 Layout</em></span><strong>›</strong></button><button class="action-card"><i>＋</i><span><b>新建线路</b><em>仅选择已发布且有岩点的 Layout</em></span><strong>›</strong></button><p class="lock"><b>发布即锁定：</b>发布前可持续标注；发布后 Layout 不可再编辑，但可用于设置线路。</p>`
  const me = `<h1>我的</h1><p class="lead">查看自己创建的墙面及 Layout 状态，或删除不再需要的内容。</p><h3>我的墙面 · ${mine.length}</h3>${mine.map(wall => `<article class="mine-card">${thumb}<span><b>${wall.name.replace(' · 本地标注草稿','')}</b><em>私有 · 1 个草稿 Layout</em><small>查看状态</small></span><mark>待标注</mark></article>`).join('')}<h3>管理范围</h3><p class="note">进入墙面后可查看 Layout 状态、删除墙面或删除尚未锁定的 Layout。删除操作须二次确认。</p>`
  root.innerHTML = `<div class="device"><header><small>CRUXSET</small><i></i></header><main>${tab === 'browse' ? browse : tab === 'create' ? create : me}</main><nav>${['browse','create','me'].map(name => `<button data-tab="${name}" class="${tab === name ? 'active' : ''}"><i></i>${name === 'browse' ? '线路' : name === 'create' ? '创建' : '我的'}</button>`).join('')}</nav></div>`
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.onclick = () => store.navigate({ name: button.dataset.tab as 'browse' | 'create' | 'me' }))
  root.querySelectorAll<HTMLButtonElement>('[data-wall]').forEach(button => button.onclick = () => store.navigate({ name: 'wall', wallId: button.dataset.wall! }))
}

store.subscribe(() => { void render() })
void render()
