export const cloudErrorMessage = (error: unknown): string => {
  const code = typeof error === 'object' && error && 'errCode' in error ? String(error.errCode) : ''
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'errMsg' in error ? String(error.errMsg) : ''
  const raw = typeof error === 'object' && error && 'rawMessage' in error ? String(error.rawMessage) : '';
  const text = `${code} ${raw} ${message}`.toUpperCase()
  if (text.includes('IMAGE_TOO_LARGE')) return '图片过大，请选择较小图片后重试'
  if (text.includes('INVALID_IMAGE_ORIENTATION')) return '图片方向无法处理，请重新拍照或选择已旋转保存的图片'
  if (text.includes('INVALID_IMAGE')) return '图片无法处理，请选择清晰的 JPEG、PNG 或 WebP 图片'
  if (text.includes('WALL_IMMUTABLE') || text.includes('WALL_LOCKED')) return '墙面已发布，不能继续修改岩点'
  if (text.includes('WALL_NOT_ROUTABLE')) return '墙面至少需要两个有效岩点才能发布或定线'
  if (text.includes('WALL_NOT_FOUND') || text.includes('WALL_DELETED')) return '墙面已删除或正在删除，请返回列表刷新'
  if (text.includes('UPLOAD_EXPIRED')) return '上传已过期，请重新选择图片'
  if (text.includes('CLEANUP')) return '清理尚未完成，请稍后重试'
  if (text.includes('CLOUD_NOT_CONFIGURED')) return '尚未配置 CloudBase 环境'
  if (text.includes('PERMISSION') || text.includes('FORBIDDEN')) return '没有权限执行此操作'
  if (text.includes('LOGIN_REQUIRED') || text.includes('AUTH')) return '请先登录后再试'
  if (text.includes('NETWORK') || text.includes('TIMEOUT')) return '网络连接失败，请检查网络后重试'
  if (text.includes('INVALID_')) return '提交的数据有误，请检查后重试'
  return /[\u4e00-\u9fff]/.test(message) && !raw && !code ? message : '操作失败，请稍后重试'
}
