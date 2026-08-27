// @ts-nocheck
import { ensureUser } from './services/users.js'
import { isMockMode } from './config/runtime.js'
App({onLaunch(){if(isMockMode()){ensureUser().catch(()=>{});return}if(wx.cloud){wx.cloud.init({env:'cloud1-d0g8toggn7735e61e',traceUser:true});ensureUser().catch(()=>{})}}})
