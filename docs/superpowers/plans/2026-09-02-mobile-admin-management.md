# 手机端管理员管理中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有手机优先 Web 工作台中，为管理员提供全量墙面与用户列表，并安全删除墙面。

**Architecture:** 后端将用户业务资料与认证资料在新的、受 `require_admin` 保护的端点中组合为安全的管理视图；仓储层新增枚举用户和认证资料的只读能力。前端为管理数据引入明确类型与 API 方法，并在“我的”页按管理员身份显示入口；管理中心保持同一二级页的双标签卡片列表，删除沿用现有级联接口及双重确认。

**Tech Stack:** FastAPI、Pydantic、Python pytest、TypeScript、Vite、Vitest、原生 DOM/CSS。

---

## 文件结构

- 修改 `server/app/repositories/protocols.py`：声明用户与认证记录的全量只读查询。
- 修改 `server/app/repositories/memory.py`、`server/app/repositories/sqlite.py`、`server/app/repositories/cloudbase.py`：以各自已有存储方式实现查询。
- 修改 `server/app/api/auth.py`：添加管理员用户列表端点及安全响应映射。
- 修改 `server/tests/test_admin_auth.py`：覆盖返回字段和访问控制。
- 修改 `web/src/api.ts`：定义 `AdminUser`，添加 `listAdminUsers()`。
- 创建 `web/src/admin-management.ts`：集中用户名回退、角色与日期的手机卡片展示数据转换，避免在渲染函数内混入转换规则。
- 修改 `web/src/main.ts`：保存管理员状态，新增管理面板、渲染与删除刷新事件。
- 修改 `web/src/styles/base.css`：为管理入口、分段标签、卡片和危险操作增加手机优先样式。
- 创建 `tests/admin-management.test.ts`：覆盖纯前端展示辅助逻辑和 API 请求。

### Task 1: 为管理员用户清单建立后端契约

**Files:**
- Modify: `server/app/repositories/protocols.py`
- Modify: `server/app/repositories/memory.py`
- Modify: `server/app/repositories/sqlite.py`
- Modify: `server/app/repositories/cloudbase.py`
- Modify: `server/tests/test_admin_auth.py`

- [ ] **Step 1: 写出失败的仓储和端点测试**

在 `server/tests/test_admin_auth.py` 追加：

```python
def test_admin_can_list_all_users_without_password_hashes():
    repository = MemoryRepository()
    admin = create_admin_account(repository, "admin@example.com", "correct horse")
    repository.insert_user({"id": "usr_member", "displayName": "攀岩者", "createdAt": 200})
    repository.insert_admin({"userId": "usr_member", "emailNormalized": "member@example.com", "role": "user", "passwordHash": "secret", "createdAt": 200})
    app.state.repository = repository

    response = TestClient(app).get(
        "/api/v1/auth/admin/users",
        cookies={session_cookie_name(): create_session(admin["userId"])},
    )

    assert response.status_code == 200
    assert response.json()["users"][0] == {
        "id": admin["userId"], "email": "admin@example.com", "displayName": "", "role": "admin",
        "createdAt": repository.find_user(admin["userId"])["createdAt"],
    }
    assert response.json()["users"][1] == {"id": "usr_member", "email": "member@example.com", "displayName": "攀岩者", "role": "user", "createdAt": 200}
    assert "passwordHash" not in str(response.json())


def test_user_list_requires_an_administrator():
    repository = MemoryRepository()
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    app.state.repository = repository
    client = TestClient(app)

    assert client.get("/api/v1/auth/admin/users").status_code == 401
    repository.find_admin_by_user_id = lambda _user_id: {"role": "user"}  # type: ignore[method-assign]
    response = client.get("/api/v1/auth/admin/users", cookies={session_cookie_name(): create_session(account["userId"])})
    assert response.status_code == 403
```

- [ ] **Step 2: 运行测试并确认失败原因是端点尚不存在**

Run: `cd server && uv run pytest tests/test_admin_auth.py::test_admin_can_list_all_users_without_password_hashes tests/test_admin_auth.py::test_user_list_requires_an_administrator -v`

Expected: FAIL，`/api/v1/auth/admin/users` 返回 404。

- [ ] **Step 3: 在协议与三种仓储中添加最小只读查询**

在 `server/app/repositories/protocols.py` 的用户/认证查询后增加：

```python
    def list_users(self) -> list[Document]: ...

    def list_admin_accounts(self) -> list[Document]: ...
```

在内存仓储中增加：

```python
    def list_users(self) -> list[Document]:
        return [deepcopy(user) for user in self._users.values()]

    def list_admin_accounts(self) -> list[Document]:
        return [deepcopy(account) for account in self._admins.values()]
```

在 SQLite 仓储中增加：

```python
    def list_users(self) -> list[Document]: return self._list("users")
    def list_admin_accounts(self) -> list[Document]: return self._list("admins")
```

在 CloudBase 仓储中增加：

```python
    def list_users(self) -> list[Document]: return self._query_all("users")
    def list_admin_accounts(self) -> list[Document]: return self._query_all("admins")
```

- [ ] **Step 4: 添加安全的管理员端点**

在 `server/app/api/auth.py` 的 `me` 端点前添加：

```python
@router.get("/admin/users")
async def list_admin_users(request: Request, _=Depends(require_admin)):
    users = {str(user["id"]): user for user in _repository(request).list_users() if user.get("id")}
    result = []
    for account in _repository(request).list_admin_accounts():
        user_id = str(account.get("userId") or "")
        user = users.get(user_id)
        email = account.get("emailNormalized")
        role = account.get("role")
        if not user or not isinstance(email, str) or role not in {"admin", "user"}:
            continue
        result.append({
            "id": user_id,
            "email": email,
            "displayName": str(user.get("displayName") or ""),
            "role": role,
            "createdAt": int(user.get("createdAt") or account.get("createdAt") or 0),
        })
    result.sort(key=lambda item: (-item["createdAt"], item["email"]))
    return {"users": result}
```

- [ ] **Step 5: 运行后端测试并修正排序断言**

Run: `cd server && uv run pytest tests/test_admin_auth.py -v`

Expected: PASS。若 `create_admin_account` 的创建时间比固定会员记录更新，按端点的降序规则调整测试期望顺序，不改变端点排序规则。

- [ ] **Step 6: 提交后端契约**

```bash
git add server/app/repositories/protocols.py server/app/repositories/memory.py server/app/repositories/sqlite.py server/app/repositories/cloudbase.py server/app/api/auth.py server/tests/test_admin_auth.py
git commit -m "feat: add admin user listing API"
```

### Task 2: 添加前端管理数据模型与客户端请求

**Files:**
- Modify: `web/src/api.ts`
- Create: `web/src/admin-management.ts`
- Create: `tests/admin-management.test.ts`

- [ ] **Step 1: 写出失败的 API 和展示转换测试**

创建 `tests/admin-management.test.ts`：

```typescript
import { expect, it, vi } from 'vitest'
import { LocalApiClient } from '../web/src/api.js'
import { adminUserCard } from '../web/src/admin-management.js'

it('loads the protected administrator user list', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ users: [{ id: 'usr_1', email: 'member@example.com', displayName: '', role: 'user', createdAt: 0 }] }), { headers: { 'Content-Type': 'application/json' } }))
  const api = new LocalApiClient('http://local.test', fetcher)
  await expect(api.listAdminUsers()).resolves.toEqual([{ id: 'usr_1', email: 'member@example.com', displayName: '', role: 'user', createdAt: 0 }])
  expect(fetcher).toHaveBeenCalledWith('http://local.test/api/v1/auth/admin/users', { credentials: 'include' })
})

it('uses the local part of an email when a user has no display name', () => {
  expect(adminUserCard({ id: 'usr_1', email: 'member@example.com', displayName: '', role: 'user', createdAt: 0 })).toMatchObject({ name: 'member', roleLabel: '普通用户' })
})
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run: `npm test -- tests/admin-management.test.ts`

Expected: FAIL，找不到 `admin-management.js` 或 `listAdminUsers`。

- [ ] **Step 3: 定义 API 类型并实现请求**

在 `web/src/api.ts` 的 `LocalUser` 后添加：

```typescript
export type AdminUser = { id: string; email: string; displayName: string; role: 'admin' | 'user'; createdAt: number }
```

在 `LocalApiClient` 中 `currentUser()` 后添加：

```typescript
  async listAdminUsers(): Promise<AdminUser[]> {
    const result = await this.get('/api/v1/auth/admin/users')
    return result.users as AdminUser[]
  }
```

- [ ] **Step 4: 实现纯展示转换函数**

创建 `web/src/admin-management.ts`：

```typescript
import type { AdminUser } from './api.js'

export type AdminUserCard = AdminUser & { name: string; roleLabel: string; registeredAt: string }

export const adminUserCard = (user: AdminUser): AdminUserCard => ({
  ...user,
  name: user.displayName.trim() || user.email.split('@', 1)[0] || '用户',
  roleLabel: user.role === 'admin' ? '管理员' : '普通用户',
  registeredAt: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(user.createdAt)),
})
```

- [ ] **Step 5: 运行前端针对性测试**

Run: `npm test -- tests/admin-management.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交前端数据层**

```bash
git add web/src/api.ts web/src/admin-management.ts tests/admin-management.test.ts
git commit -m "feat: add admin management data client"
```

### Task 3: 接入手机端管理中心与安全删除

**Files:**
- Modify: `web/src/main.ts`
- Modify: `web/src/styles/base.css`
- Modify: `tests/web-interaction-safety.test.ts`

- [ ] **Step 1: 为确认文案写失败测试**

在 `tests/web-interaction-safety.test.ts` 追加：

```typescript
it('names the managed wall and its linked routes in the final deletion warning', async () => {
  const messages: string[] = []
  await confirmWallDeletion(message => { messages.push(message); return true }, async () => undefined, '主墙')
  expect(messages.at(-1)).toContain('主墙')
  expect(messages.at(-1)).toContain('所有相关线路')
})
```

- [ ] **Step 2: 运行测试并确认新的参数尚不支持**

Run: `npm test -- tests/web-interaction-safety.test.ts`

Expected: FAIL，`confirmWallDeletion` 尚不接受墙面名称参数。

- [ ] **Step 3: 将删除确认函数扩展为带墙面名称的提示**

在 `web/src/ui-behavior.ts` 中将导出的函数改为：

```typescript
export const confirmWallDeletion = async (confirm: (message: string) => boolean, remove: () => Promise<unknown>, wallName = '这面墙') => {
  if (!confirm(`确定要删除“${wallName}”吗？`)) return { ok: false, cancelled: true }
  return confirmAndDelete(() => confirm(`删除“${wallName}”将同时删除所有相关线路和原始关联图片文件，此操作无法撤销。是否继续？`), remove)
}
```

- [ ] **Step 4: 添加管理页状态、入口和渲染**

在 `web/src/main.ts`：

1. 导入 `AdminUser` 与 `adminUserCard`；将 `LocalUser` 登录结果保存在 `isAdmin` 变量中。
2. 将 `panel` 联合类型扩展为 `"admin-management"`，新增 `adminTab: "walls" | "users" = "walls"`、`adminUsers: AdminUser[] = []` 与 `adminLoading = false`。
3. 在登录与恢复会话成功后从 `user.isAdmin` 更新 `isAdmin`；退出时重置为 `false`。不要仅依靠客户端入口做权限保护。
4. 在“我的”首页模板的三个既有卡片之后，仅当 `isAdmin` 时追加：

```typescript
${isAdmin ? `<button class="hub-card admin-management" data-panel="admin-management"><i>▦</i><span><b>管理中心</b><em>墙面与用户管理</em></span><strong>›</strong></button>` : ''}
```

5. 为 `panel === "admin-management"` 添加分支：首次进入时设 `adminLoading = true` 并调用 `api.listAdminUsers()`；加载成功后以 `adminUserCard` 显示用户卡片，失败时显示 `managementError`。墙面卡片使用已经加载的 `store.session.listWalls()` 全量结果，按 `createdAt` 降序排序，显示编号、名称、拥有者（匹配 `adminUsers` 的用户名，否则“未知用户”）、状态、创建日期与删除按钮。
6. 标签按钮使用 `data-admin-tab="walls"` / `"users"` 更新 `adminTab` 并重新渲染；删除按钮使用 `data-admin-delete-wall`，通过 `confirmWallDeletion(window.confirm, () => store.session.deleteWall(id), wall.name)` 删除。成功后重新加载墙面和 `adminUsers`，失败时将错误写入 `managementError`。
7. 管理页模板包含：固定返回按钮、`<h1>管理中心</h1>`、说明、带计数的 `role="tablist"` 按钮、空状态和错误提示。所有动态文字继续经现有 `h()` 转义。

- [ ] **Step 5: 添加手机优先样式**

在 `web/src/styles/base.css` 末尾追加：

```css
.hub-card.admin-management{background:#e6efff;border-color:#ceddff}.hub-card.admin-management i{background:#fff;color:#5268d9}.admin-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin:18px 0;background:#ececf5;border-radius:14px}.admin-tabs button{padding:9px;border:0;border-radius:10px;background:transparent;color:#686986;font-weight:800}.admin-tabs button.active{background:#fff;color:var(--ink);box-shadow:0 2px 8px #27224412}.admin-list{display:grid;gap:10px}.admin-card{padding:15px;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:0 5px 14px #2722440a}.admin-card-head{display:flex;align-items:start;gap:8px}.admin-card h2{margin:0;flex:1;font-size:16px;overflow-wrap:anywhere}.admin-card p{margin:7px 0 0;color:#6a6b88;font-size:12px;line-height:1.6}.admin-status{padding:4px 7px;border-radius:999px;background:#e5f8e9;color:#28734a;font-size:11px;font-weight:800}.admin-status.draft{background:#fff5dc;color:#9b7817}.admin-delete{margin-top:13px;padding:7px 10px;border:1px solid #efb9b5;border-radius:10px;background:#fff;color:#bb4d49;font-size:12px;font-weight:800}.admin-empty{margin:26px 0;text-align:center;color:#6a6b88;font-size:14px}
```

- [ ] **Step 6: 运行交互测试并完成 TypeScript 检查**

Run: `npm test -- tests/web-interaction-safety.test.ts tests/admin-management.test.ts && npm run build`

Expected: PASS，且 TypeScript 无错误。

- [ ] **Step 7: 进行人工手机视口验证**

Run: `npm run web`

在浏览器的窄屏视口中，以管理员登录后验证：入口出现、两个标签均可切换、长邮箱换行、删除取消不变更数据、二次确认后墙面与关联线路消失。以普通用户登录后验证入口不显示；直接请求用户列表端点确认服务端返回 403。

- [ ] **Step 8: 提交手机管理界面**

```bash
git add web/src/main.ts web/src/styles/base.css web/src/ui-behavior.ts tests/web-interaction-safety.test.ts
git commit -m "feat: add mobile admin management screen"
```

### Task 4: 完整回归验证

**Files:**
- Verify only: `server/tests/`
- Verify only: `tests/`
- Verify only: `web/`

- [ ] **Step 1: 运行全部后端测试**

Run: `cd server && uv run pytest -v`

Expected: PASS。

- [ ] **Step 2: 运行全部前端测试与构建**

Run: `npm test && npm run build && npm run web:build`

Expected: 每条命令均以 0 退出；Vitest 全绿，两个 TypeScript 配置通过，生产 Web 构建完成。

- [ ] **Step 3: 检查变更边界与提交状态**

Run: `git status --short && git log --oneline -3`

Expected: 只有本计划范围内文件发生变更；三个功能提交存在且工作树干净。不要将 `.superpowers/brainstorm/` 的可视化临时文件纳入提交。
