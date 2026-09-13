import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('logs the failing cloud function and original error without request data', async () => {
 vi.resetModules()
 const log = vi.spyOn(console, 'error').mockImplementation(() => {})
 vi.stubGlobal('wx', { getStorageSync:vi.fn(), setStorageSync:vi.fn(), cloud: { callFunction: ({name, success, fail}:any) => {
  if(name==='login') success({result:{userId:'u'}})
  else fail({errCode:-504003,errMsg:'cloud.callFunction:fail response exceeded limit',requestId:'request-1'})
 } } })
 const {call}=await import('../wechat/miniprogram/services/cloud.js')
 await expect(call('wallManager',{action:'listBrowseWalls',privateData:'do-not-log'})).rejects.toThrow()
 expect(log).toHaveBeenCalledWith('[CruxSet cloud call failed]', {functionName:'wallManager',action:'listBrowseWalls',code:-504003,message:'cloud.callFunction:fail response exceeded limit',requestId:'request-1'})
 expect(JSON.stringify(log.mock.calls)).not.toContain('do-not-log')
})
