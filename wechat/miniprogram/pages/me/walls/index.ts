// @ts-nocheck
import { listMyWalls } from '../../../services/walls.js'
import { confirmWallDeletion } from '../../../services/wall-deletion.js'
import { browsePage } from '../../../services/browse-page.js'
import { beginPageRead } from '../../../services/page-read-state.js'
Page(browsePage({
  data:{walls:[],loading:true,refreshing:false,error:'',notice:'',refreshNotice:'',deleting:''},
  readNoticeKey:'refreshNotice',
  cacheMatches(key){return key==='*'},
  onShow(){return this.reload()},
  async reload(){const read=beginPageRead(this,{walls:[]});try{read.success({walls:(await listMyWalls()).sort((a,b)=>b.updatedAt-a.updatedAt||b.id.localeCompare(a.id))})}catch(error){read.failure(error)}finally{read.finish()}},
  remove(e){return confirmWallDeletion(this,e.currentTarget.dataset.wallId)},
}))
