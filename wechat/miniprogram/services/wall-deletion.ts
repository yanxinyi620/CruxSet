// @ts-nocheck
import { inspectWallDeletion, deleteWall } from './walls.js'
import { cloudErrorMessage } from './errors.js'
/** Both personal and administrator lists use the same destructive-action explanation. */
export async function confirmWallDeletion(page, wallId: string) {
  if (page.data.deleting) return
  page.setData({deleting:wallId,error:''})
  try {
    const {problemCount} = await inspectWallDeletion(wallId)
    await new Promise<void>(resolve => wx.showModal({
      title:'删除墙面？',
      content:`将删除这面墙及关联的 ${problemCount} 条线路（包括其他用户创建的线路），并清理不再使用的图片。此操作不可恢复。`,
      confirmText:'确认删除',confirmColor:'#b43f55',
      success: async result => {
        try {
          if (result.confirm) {
            const deleted = await deleteWall(wallId)
            page.setData({notice:deleted.deletionPending ? '关联线路尚未清理完，请点击“继续删除”。' : deleted.cleanupPending ? '墙面已删除，图片清理待重试。' : '墙面及关联线路已删除。'})
            await page.reload()
          }
        } catch(error) { page.setData({error:cloudErrorMessage(error) + '，可再次删除以继续清理。'}) }
        finally { resolve() }
      }, fail:()=>resolve(),
    }))
  } catch(error) { page.setData({error:cloudErrorMessage(error)}) }
  finally { page.setData({deleting:''}) }
}
