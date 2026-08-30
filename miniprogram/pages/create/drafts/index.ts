// @ts-nocheck
import { listMyWalls } from '../../../services/walls.js'
Page({data:{drafts:[],loading:true},onShow(){this.reload()},async reload(){this.setData({loading:true});try{const drafts=(await listMyWalls()).filter(wall=>wall.visibility === 'private');this.setData({drafts,loading:false})}catch{this.setData({drafts:[],loading:false})}},resumeDraft(event){wx.navigateTo({url:`/pages/admin/wall-editor/index?wallId=${event.currentTarget.dataset.wallId}`})}})
