import { expect, it } from 'vitest'
import { cloudErrorMessage } from '../miniprogram/services/errors.js'
it('maps common cloud errors to safe user-facing messages', () => { expect(cloudErrorMessage(new Error('CLOUD_NOT_CONFIGURED'))).toBe('尚未配置 CloudBase 环境'); expect(cloudErrorMessage({ errCode: 'PERMISSION_DENIED' })).toBe('没有权限执行此操作') })
