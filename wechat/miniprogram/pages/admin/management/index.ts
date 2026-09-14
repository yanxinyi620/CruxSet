// @ts-nocheck
import { currentUserIsAdmin, listUsers } from '../../../services/users.js'
import { listAdminWalls, retryCleanup, reclaimUploads } from '../../../services/walls.js'
import { cloudErrorMessage } from '../../../services/errors.js'
import { confirmWallDeletion } from '../../../services/wall-deletion.js'
import { browsePage } from '../../../services/browse-page.js'
import { beginPageRead } from '../../../services/page-read-state.js'
const date = value => {const d=new Date(value);return Number.isNaN(d.getTime())?'—':`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`}
Page(browsePage({
  data:{tab:'walls',walls:[],users:[],loading:true,refreshing:false,allowed:false,error:'',notice:'',refreshNotice:'',deleting:'',cleaning:false},
  readNoticeKey:'refreshNotice',
  cacheMatches(key){return key==='*'},
  onShow(){return this.reload()},
  async reload(){const read=beginPageRead(this,{allowed:false,walls:[],users:[]});try{
    const allowed=await currentUserIsAdmin();if(!read.current())return;if(!allowed){read.success({allowed:false,walls:[],users:[]});return}
    const [walls,users]=await Promise.all([listAdminWalls(),listUsers()])
    const owners=new Map(users.map(u=>[u.id,u.displayName||'未设置昵称']))
    read.success({allowed,walls:walls.map(w=>({...w,ownerName:owners.get(w.ownerId)||'未知用户',date:date(w.createdAt)})),users:users.map(u=>({...u,date:date(u.createdAt)}))})
    }catch(error){read.failure(error)}finally{read.finish()}},
  selectTab(e){this.setData({tab:e.currentTarget.dataset.tab})},
  remove(e){return confirmWallDeletion(this,e.currentTarget.dataset.wallId)},
  async cleanup(){if(this.data.cleaning)return;this.setData({cleaning:true,error:''});try{await Promise.all([retryCleanup(),reclaimUploads()]);this.setData({notice:'已重试待清理图片，并检查过期上传。'})}catch(error){this.setData({error:cloudErrorMessage(error)})}finally{this.setData({cleaning:false})}},
}))
