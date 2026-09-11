import type { AdminUser } from './api.js'

export type AdminUserCard = AdminUser & { name: string; roleLabel: string; registeredAt: string }

export const adminUserCard = (user: AdminUser): AdminUserCard => ({
  ...user,
  name: user.displayName.trim() || user.email.split('@', 1)[0] || '用户',
  roleLabel: user.role === 'admin' ? '管理员' : user.labEnabled ? '创作者' : '普通用户',
  registeredAt: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(user.createdAt)),
})

/** Local replies contain only the changed fields; keep the existing account metadata. */
export function withLabAccess(user: AdminUser, update: Pick<AdminUser, 'id' | 'labEnabled'>): AdminUser {
  if (update?.id !== user.id || typeof update.labEnabled !== 'boolean') throw new Error('授权响应无效，请刷新后确认权限状态。')
  return { ...user, labEnabled: update.labEnabled }
}
