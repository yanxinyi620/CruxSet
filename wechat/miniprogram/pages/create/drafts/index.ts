// @ts-nocheck
import { currentUserIsAdmin } from '../../../services/users.js'
import { listDrafts } from '../../../services/walls.js'
import { cloudErrorMessage } from '../../../services/errors.js'
Page({data:{allowed:false,loading:true,walls:[],error:''},onShow(){return this.reload()},async reload(){this.setData({loading:true,error:''});try{const allowed=await currentUserIsAdmin();this.setData({allowed,walls:allowed?await listDrafts():[]})}catch(error){this.setData({error:cloudErrorMessage(error)})}finally{this.setData({loading:false})}},resumeDraft(e){if(this.data.allowed)wx.navigateTo({url:`/pages/admin/wall-editor/index?wallId=${encodeURIComponent(e.currentTarget.dataset.id)}`})}})
