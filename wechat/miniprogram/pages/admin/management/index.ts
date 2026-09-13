// @ts-nocheck
import { currentUserIsAdmin, listUsers } from '../../../services/users.js'
import { listAdminWalls, retryCleanup, reclaimUploads } from '../../../services/walls.js'
import { cloudErrorMessage } from '../../../services/errors.js'
import { confirmWallDeletion } from '../../../services/wall-deletion.js'
const date = value => {const d=new Date(value);return Number.isNaN(d.getTime())?'—':`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`}
Page({
  data:{tab:'walls',walls:[],users:[],loading:true,allowed:false,error:'',notice:'',deleting:'',cleaning:false},
  onShow(){return this.reload()},
  async reload(){this.setData({loading:true,error:''});try{
    const allowed=await currentUserIsAdmin();this.setData({allowed});if(!allowed)return
    const [walls,users]=await Promise.all([listAdminWalls(),listUsers()])
    const owners=new Map(users.map(u=>[u.id,u.displayName||'未设置昵称']))
    this.setData({walls:walls.map(w=>({...w,ownerName:owners.get(w.ownerId)||'未知用户',date:date(w.createdAt)})),users:users.map(u=>({...u,date:date(u.createdAt)}))})
    }catch(error){this.setData({error:cloudErrorMessage(error)})}finally{this.setData({loading:false})}},
  selectTab(e){this.setData({tab:e.currentTarget.dataset.tab})},
  remove(e){return confirmWallDeletion(this,e.currentTarget.dataset.wallId)},
  async cleanup(){if(this.data.cleaning)return;this.setData({cleaning:true,error:''});try{await Promise.all([retryCleanup(),reclaimUploads()]);this.setData({notice:'已重试待清理图片，并检查过期上传。'})}catch(error){this.setData({error:cloudErrorMessage(error)})}finally{this.setData({cleaning:false})}},
})
