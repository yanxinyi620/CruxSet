import type { Wall } from '../../miniprogram/domain/types.js'
export type LocalUser = { id: string; email: string; displayName?: string; isAdmin: boolean }
export type BrowseData = { walls: unknown[]; problems: unknown[] }
export type NewWallDraft = { name: string; image: File; imageWidth: number; imageHeight: number }
export type ProblemInput = { wallId: string; angle: number; grade: string; footRule: string; name?: string; description?: string; holds: Record<string, string[]> }
export type ProblemUpdate = { angle: number; grade: string; footRule: string; name?: string; description?: string; holds?: Record<string, string[]> }
export class ApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message); this.name = 'ApiError' }
}
export function localApiBaseUrl(_location: Pick<Location, 'protocol' | 'hostname'> = window.location): string { return '' }
export class LocalApiClient {
  private fetcher: typeof fetch
  constructor(private baseUrl = localApiBaseUrl(), fetcher?: typeof fetch) { this.fetcher = fetcher ?? ((input, init) => globalThis.fetch(input, init)) }
  async register(email: string, password: string, confirmPassword: string): Promise<LocalUser> { const result = await this.request('/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, confirmPassword }) }); return result.user as LocalUser }
  async login(email: string, password: string): Promise<LocalUser> { const fetcher = this.fetcher; const response = await fetcher(`${this.baseUrl}/api/v1/auth/admin/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); if (!response.ok) throw new Error('登录失败，请检查邮箱和密码'); return (await response.json()).user as LocalUser }
  async currentUser(): Promise<LocalUser | null> { const fetcher = this.fetcher; const response = await fetcher(`${this.baseUrl}/api/v1/auth/me`, { credentials: 'include' }); if (response.status === 401) return null; if (!response.ok) throw new Error('无法检查登录状态'); return (await response.json()).user as LocalUser }
  async logout(): Promise<{ ok: true }> { return (await this.request('/api/v1/auth/logout', { method: 'POST' })) as { ok: true } }
  async updateProfile(displayName: string) { return this.request('/api/v1/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName }) }) as unknown as { user: LocalUser } }
  async loadBrowseData(): Promise<BrowseData> {
    const [wallData, problemData] = await Promise.all([
      this.get('/api/v1/walls'),
      this.get('/api/v1/problems'),
    ])
    return { walls: wallData.walls as unknown[], problems: problemData.problems as unknown[] }
  }
  async createWall(input: NewWallDraft): Promise<Wall> { const form = new FormData(); form.append('file', input.image); const upload = await this.request('/api/v1/media/images', { method: 'POST', body: form }); const mediaId = (upload.media as { id: string }).id; try { const result = await this.request('/api/v1/walls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.name, imageFileId: (upload.media as { url: string }).url, imageWidth: input.imageWidth, imageHeight: input.imageHeight }) }); return result.wall as Wall } catch (error) { await this.request(`/api/v1/media/${encodeURIComponent(mediaId)}`, { method: 'DELETE' }).catch(() => undefined); throw error } }
  async saveWallHolds(wallId: string, holds: unknown[]): Promise<{ wall: Wall }> { return this.request(`/api/v1/walls/${encodeURIComponent(wallId)}/holds`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holds }) }) as unknown as { wall: Wall } }
  async publishWall(wallId: string): Promise<{ wall: Wall }> { return this.request(`/api/v1/walls/${encodeURIComponent(wallId)}/publish`, { method: 'POST' }) as unknown as { wall: Wall } }
  async createProblem(input: ProblemInput): Promise<{ problem: { id: string; number: string } }> { return this.request('/api/v1/problems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }) as unknown as { problem: { id: string; number: string } } }
  async deleteProblem(id: string): Promise<{ ok: boolean }> { return this.request(`/api/v1/problems/${encodeURIComponent(id)}`, { method: 'DELETE' }) as unknown as { ok: boolean } }
  async updateProblem(id: string, input: ProblemUpdate) { return this.request(`/api/v1/problems/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }) as unknown as { problem: Record<string, unknown> } }
  async deleteWall(id: string): Promise<{ ok: boolean }> { return this.request(`/api/v1/walls/${encodeURIComponent(id)}`, { method: 'DELETE' }) as unknown as { ok: boolean } }
  private get(path: string) { return this.request(path) }
  private async request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> { const fetcher = this.fetcher; const response = await fetcher(`${this.baseUrl}${path}`, { credentials: 'include', ...init }); if (!response.ok) { const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null; throw new ApiError(body?.error?.message || '无法读取本地工作台数据', body?.error?.code) } return await response.json() as Record<string, unknown> }
}
