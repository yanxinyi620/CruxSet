export type LocalUser = { id: string; isAdmin: boolean }
export type BrowseData = { walls: unknown[]; layouts: unknown[]; problems: unknown[] }

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

  private async get(path: string): Promise<Record<string, unknown>> {
    const fetcher = this.fetcher
    const response = await fetcher(`${this.baseUrl}${path}`, { credentials: 'include' })
    if (!response.ok) throw new Error('无法读取本地工作台数据')
    return await response.json() as Record<string, unknown>
  }
}
