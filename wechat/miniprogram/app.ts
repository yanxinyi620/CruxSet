// @ts-nocheck
import { ensureUser } from './services/users.js'
App({onLaunch(){if(wx.cloud){wx.cloud.init({env:'cloud1-d0g8toggn7735e61e',traceUser:true});ensureUser().catch(()=>{})}}})
