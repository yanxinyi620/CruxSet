// @ts-nocheck
import { listMyProblems } from '../../services/problems.js'
import { currentUserIsAdmin } from '../../services/users.js'
import { syncTabBar } from '../../services/tab-bar.js'
import { cloudErrorMessage } from '../../services/errors.js'
Page({data:{loading:true,problemCount:0,isAdmin:false,error:''},onShow(){syncTabBar(this, 2);return this.reload()},async reload(){this.setData({loading:true});try{const [problems,isAdmin]=await Promise.all([listMyProblems(),currentUserIsAdmin()]);this.setData({problemCount:problems.length,isAdmin,error:''})}catch(error){this.setData({isAdmin:false,error:cloudErrorMessage(error)})}finally{this.setData({loading:false})}},openProfile(){wx.navigateTo({url:'/pages/profile/index'})},openWalls(){wx.navigateTo({url:'/pages/me/walls/index'})},openProblems(){wx.navigateTo({url:'/pages/me/problems/index'})},openManagement(){if(this.data.isAdmin)wx.navigateTo({url:'/pages/admin/management/index'})}})
