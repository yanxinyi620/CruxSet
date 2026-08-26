export const cloudErrorMessage = (error: unknown): string => {
  const code = typeof error === 'object' && error && 'errCode' in error ? String(error.errCode) : ''
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'errMsg' in error ? String(error.errMsg) : ''
  const text = `${code} ${message}`.toUpperCase()
  if (text.includes('CLOUD_NOT_CONFIGURED')) return '尚未配置 CloudBase 环境'
  if (text.includes('PERMISSION') || text.includes('FORBIDDEN')) return '没有权限执行此操作'
  if (text.includes('LOGIN_REQUIRED') || text.includes('AUTH')) return '请先登录后再试'
  if (text.includes('NETWORK') || text.includes('TIMEOUT')) return '网络连接失败，请检查网络后重试'
  if (text.includes('INVALID_')) return '提交的数据有误，请检查后重试'
  return '操作失败，请稍后重试'
}
