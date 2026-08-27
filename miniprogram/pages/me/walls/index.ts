// @ts-nocheck
import { deleteLayout, listLayouts } from '../../../services/layouts.js'
import { listMyWalls } from '../../../services/walls.js'
Page({data:{layouts:[]},onShow(){this.reload()},async reload(){const walls=await listMyWalls();const layouts=(await Promise.all(walls.map(async wall=>(await listLayouts(wall.id)).map(layout=>({id:layout.id,wallId:wall.id,wallName:wall.name,layoutName:layout.name,published:layout.published,updatedAt:layout.updatedAt}))))).flat();this.setData({layouts:layouts.sort((a,b)=>b.updatedAt-a.updatedAt)})},remove(e){const {wallId,layoutId}=e.currentTarget.dataset;wx.showModal({title:'删除 Layout？',content:'关联线路将一并删除，此操作不可恢复。',success:r=>r.confirm&&deleteLayout(wallId,layoutId).then(()=>this.reload())})}})
