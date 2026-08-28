export type LocalUser = { id: string; isAdmin: boolean }
export type BrowseData = { walls: unknown[]; layouts: unknown[]; problems: unknown[] }
export type NewWallDraft = { name: string; layoutName: string; image: File; imageWidth: number; imageHeight: number }
export type ProblemInput = {
  wallId: string
  layoutId: string
  angle: number
  grade: string
  footRule: string
  name?: string
  description?: string
  holds: Record<string, string[]>
}

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

  async createLayout(wallId: string, data: { name: string; imageFileId: string; imageWidth: number; imageHeight: number; geometryType?: string }): Promise<{ layout: { id: string; published: boolean } }> {
    return this.request(`/api/v1/walls/${encodeURIComponent(wallId)}/layouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) as unknown as { layout: { id: string; published: boolean } }
  }

  /** 保存草稿 Layout 的岩点（不发布、不锁定）。 */
  async saveLayoutHolds(layoutId: string, holds: unknown[]): Promise<{ layout: { id: string; published: boolean } }> {
    return this.request(`/api/v1/layouts/${encodeURIComponent(layoutId)}/holds`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holds }) }) as unknown as { layout: { id: string; published: boolean } }
  }

  /** 发布草稿 Layout（携带最终岩点，发布后永久锁定）。 */
  async publishLayout(layoutId: string, holds: unknown[]): Promise<{ layout: { id: string; published: boolean } }> {
    return this.request(`/api/v1/layouts/${encodeURIComponent(layoutId)}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holds }) }) as unknown as { layout: { id: string; published: boolean } }
  }

  async createProblem(input: ProblemInput): Promise<{ problem: { id: string; number: string } }> {
    return this.request('/api/v1/problems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }) as unknown as { problem: { id: string; number: string } }
  }

  async deleteProblem(id: string): Promise<{ ok: boolean }> {
    return this.request(`/api/v1/problems/${encodeURIComponent(id)}`, { method: 'DELETE' }) as unknown as { ok: boolean }
  }

  async deleteLayout(layoutId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/v1/layouts/${encodeURIComponent(layoutId)}?confirmCascade=true`, { method: 'DELETE' }) as unknown as { ok: boolean }
  }

  async deleteWall(wallId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/v1/walls/${encodeURIComponent(wallId)}?confirmCascade=true`, { method: 'DELETE' }) as unknown as { ok: boolean }
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    return this.request(path)
  }

  private async request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const fetcher = this.fetcher
    const response = await fetcher(`${this.baseUrl}${path}`, { credentials: 'include', ...init })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
      throw new Error(body?.error?.message || '无法读取本地工作台数据')
    }
    return await response.json() as Record<string, unknown>
  }
}