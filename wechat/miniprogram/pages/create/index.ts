// @ts-nocheck
import { syncTabBar } from '../../services/tab-bar.js'
import { currentUserIsAdmin } from '../../services/users.js'
import { cloudErrorMessage } from '../../services/errors.js'
Page({data:{isAdmin:false,error:''},onShow(){syncTabBar(this, 1);return this.reload()},async reload(){try{this.setData({isAdmin:await currentUserIsAdmin(),error:''})}catch(error){this.setData({isAdmin:false,error:cloudErrorMessage(error)})}},createProblem(){wx.navigateTo({url:'/pages/wall-picker/index?mode=create'})},createWall(){if(this.data.isAdmin)wx.navigateTo({url:'/pages/admin/index'})},openDrafts(){if(this.data.isAdmin)wx.navigateTo({url:'/pages/create/drafts/index'})}})
