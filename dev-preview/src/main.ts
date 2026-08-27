import './styles/tokens.css'
import './styles/base.css'
import { PreviewStore } from './preview-store.js'

const root = document.querySelector<HTMLElement>('#app')!
const store = new PreviewStore()

const render = async () => {
  const route = store.state.route
  const walls = route.name === 'browse' ? await store.session.listWalls() : []
  root.innerHTML = `<div class="device"><header><small>CRUXSET · DEV PREVIEW</small><strong>${route.name === 'browse' ? '选择墙面' : route.name === 'create' ? '创建' : '我的'}</strong></header><main>${route.name === 'browse' ? `<p class="intro">先选择可浏览的训练墙和已发布 Layout，再查看线路。</p>${walls.map(wall => `<button class="wall-card" data-wall="${wall.id}"><span>${wall.visibility === 'public' ? '公开墙面' : '私有墙面'}</span><b>${wall.name}</b><em>${wall.description || '查看可用 Layout 与线路'}</em></button>`).join('') || '<p>暂无公开墙面</p>'}` : route.name === 'create' ? '<p class="intro">新建墙面、继续我的草稿，或在已发布 Layout 上设置线路。</p><button class="primary" data-new-wall>新建墙面</button>' : '<p class="intro">查看自己的墙面状态，并管理删除操作。</p>'}</main><nav><button data-tab="browse" class="${route.name === 'browse' ? 'active' : ''}">线路</button><button data-tab="create" class="${route.name === 'create' ? 'active' : ''}">创建</button><button data-tab="me" class="${route.name === 'me' ? 'active' : ''}">我的</button></nav></div>`
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.onclick = () => store.navigate({ name: button.dataset.tab as 'browse' | 'create' | 'me' }))
  root.querySelectorAll<HTMLButtonElement>('[data-wall]').forEach(button => button.onclick = () => store.navigate({ name: 'wall', wallId: button.dataset.wall! }))
}

store.subscribe(() => { void render() })
void render()
