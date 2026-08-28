export type LocalUser = { id: string; isAdmin: boolean }

export class LocalApiClient {
  constructor(private baseUrl = 'http://localhost:8000', private fetcher: typeof fetch = fetch) {}

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
}
