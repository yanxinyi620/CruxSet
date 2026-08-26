export const cloudErrorMessage = (error: unknown): string => {
  const code = typeof error === 'object' && error && 'errCode' in error ? String(error.errCode) : ''
  if (code.includes('PERMISSION')) return '没有权限执行此操作'
  if (code.includes('LOGIN') || code.includes('AUTH')) return '请先登录后再试'
  if (code.includes('NETWORK')) return '网络连接失败，请检查网络后重试'
  if (error instanceof Error && error.message === 'CLOUD_NOT_CONFIGURED') return '尚未配置 CloudBase 环境'
  return '操作失败，请稍后重试'
}
