// @ts-nocheck
import { currentUserIsAdmin } from '../../../services/users.js'
import { listDrafts } from '../../../services/walls.js'
import { browsePage } from '../../../services/browse-page.js'
import { beginPageRead } from '../../../services/page-read-state.js'
Page(browsePage({data:{allowed:false,loading:true,refreshing:false,walls:[],error:'',notice:''},cacheMatches(key){return key==='*'},onShow(){return this.reload()},async reload(){const read=beginPageRead(this,{allowed:false,walls:[]});try{const allowed=await currentUserIsAdmin();read.success({allowed,walls:allowed?await listDrafts():[]})}catch(error){read.failure(error)}finally{read.finish()}},resumeDraft(e){if(this.data.allowed)wx.navigateTo({url:`/pages/admin/wall-editor/index?wallId=${encodeURIComponent(e.currentTarget.dataset.id)}`})}}))
