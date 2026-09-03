import type { Wall } from '../../wechat/miniprogram/domain/types.js'
import { PreviewSession } from './data/preview-session.js'
import { ApiSession } from './data/api-session.js'
import { LocalApiClient } from './api.js'
import { fromPreviewUrl, toPreviewUrl, type PreviewRoute } from './routes.js'

type Dialog = { kind: 'delete-wall'; wallId: string; step: 1 | 2 }
export type PreviewState = { route: PreviewRoute; device: 'iphone16' | 'iphone-se' | 'pixel'; dialog?: Dialog; toast?: string }

export class PreviewStore {
  session: PreviewSession = new PreviewSession()
  state: PreviewState = { route: fromPreviewUrl(typeof window === 'undefined' ? '/' : window.location.pathname), device: 'iphone16' }
  private listeners = new Set<() => void>()
  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit() { this.listeners.forEach(listener => listener()) }
  navigate(route: PreviewRoute, options: { replace?: boolean; silentHistory?: boolean } = {}) {
    this.state = { ...this.state, route }
    if (!options.silentHistory) {
      const method = options.replace ? 'replaceState' : 'pushState'
      if (typeof window !== 'undefined') window.history[method]({}, '', toPreviewUrl(route))
    }
    this.emit()
  }
  setDevice(device: PreviewState['device']) { this.state = { ...this.state, device }; this.emit() }
  async createWall(input: Partial<Wall>) { const wall = await this.session.createWall({ ...input, name: input.name ?? '', imageWidth: input.imageWidth ?? 0, imageHeight: input.imageHeight ?? 0 }); this.navigate({ name: 'me' }); return wall }
  async useApi(api: LocalApiClient) { const session = new ApiSession(api); await session.refresh(); this.session = session; this.emit() }
  requestWallDeletion(wallId: string) { this.state = { ...this.state, dialog: { kind: 'delete-wall', wallId, step: 1 } }; this.emit() }
  async confirmDialog() { const dialog = this.state.dialog; if (!dialog) return; if (dialog.step === 1) { this.state = { ...this.state, dialog: { ...dialog, step: 2 } }; this.emit(); return } await this.session.deleteWall(dialog.wallId); this.state = { ...this.state, route: { name: 'me' }, dialog: undefined, toast: '墙面及关联内容已删除' }; this.emit() }
}
