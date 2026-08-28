export type LocalUser = { id: string; isAdmin: boolean }
export type BrowseData = { walls: unknown[]; layouts: unknown[]; problems: unknown[] }
export type NewWallDraft = { name: string; layoutName: string; image: File; imageWidth: number; imageHeight: number }

export function localApiBaseUrl(location: Pick<Location, 'protocol' | 'hostname'> = window.location): string {
  return `${location.protocol}//${location.hostname}:8000`
}

export class LocalApiClient {
  constructor(private baseUrl = localApiBaseUrl(), private fetcher: typeof fetch = fetch) {}

  async login(email: string, password: string): Promise<LocalUser> {
    const fetcher = this.fetcher
    const response = await fetcher(`${this.baseUrl}/api/v1/auth/admin/login`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    })
    if (!response.ok) throw new Error('登录失败，请检查邮箱和密码')
    return (await response.json()).user as LocalUser
  }

  async currentUser(): Promise<LocalUser | null> {
    const fetcher = this.fetcher
    const response = await fetcher(`${this.baseUrl}/api/v1/auth/me`, { credentials: 'include' })
    if (response.status === 401) return null
    if (!response.ok) throw new Error('无法检查登录状态')
    return (await response.json()).user as LocalUser
  }

  async loadBrowseData(): Promise<BrowseData> {
    const walls = (await this.get('/api/v1/walls')).walls as { id: string }[]
    const layouts = (await Promise.all(walls.map(wall => this.get(`/api/v1/walls/${wall.id}/layouts`)))).flatMap(result => result.layouts as unknown[])
    const problems = (await this.get('/api/v1/problems')).problems as unknown[]
    return { walls, layouts, problems }
  }

  async createWallWithDraft(input: NewWallDraft): Promise<{ id: string; published: boolean }> {
    const upload = await this.request('/api/v1/media/images', { method: 'POST', body: (() => { const form = new FormData(); form.append('file', input.image); return form })() })
    const wall = await this.request('/api/v1/walls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.name }) })
    const layout = await this.request(`/api/v1/walls/${(wall.wall as { id: string }).id}/layouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.layoutName, imageFileId: (upload.media as { url: string }).url, imageWidth: input.imageWidth, imageHeight: input.imageHeight }) })
    return layout.layout as { id: string; published: boolean }
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    return this.request(path)
  }

  private async request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const fetcher = this.fetcher
    const response = await fetcher(`${this.baseUrl}${path}`, { credentials: 'include', ...init })
    if (!response.ok) throw new Error('无法读取本地工作台数据')
    return await response.json() as Record<string, unknown>
  }
}
