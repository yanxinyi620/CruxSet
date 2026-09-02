import type { AdminUser } from './api.js'

export type AdminUserCard = AdminUser & { name: string; roleLabel: string; registeredAt: string }

export const adminUserCard = (user: AdminUser): AdminUserCard => ({
  ...user,
  name: user.displayName.trim() || user.email.split('@', 1)[0] || '用户',
  roleLabel: user.role === 'admin' ? '管理员' : '普通用户',
  registeredAt: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(user.createdAt)),
})
