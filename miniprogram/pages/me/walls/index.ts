// @ts-nocheck
import { currentUserIsAdmin } from '../../../services/users.js'
import { deleteWall,listAdminWalls } from '../../../services/walls.js'
Page({data:{walls:[]},onShow(){currentUserIsAdmin().then(isAdmin=>{if(!isAdmin)return wx.reLaunch({url:'/pages/me/index'});this.reload()}).catch(()=>wx.reLaunch({url:'/pages/me/index'}))},async reload(){this.setData({walls:(await listAdminWalls()).sort((a,b)=>b.updatedAt-a.updatedAt)})},remove(e){const wallId=e.currentTarget.dataset.wallId;wx.showModal({title:'删除墙面？',content:'有线路使用该墙面时无法删除。',success:r=>r.confirm&&deleteWall(wallId).then(()=>this.reload()).catch(error=>wx.showToast({title:String(error.message).includes('WALL_IN_USE')?'墙面正在被线路使用':'删除失败',icon:'none'}))})}})
