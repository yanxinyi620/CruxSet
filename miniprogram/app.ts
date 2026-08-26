// @ts-nocheck
import { ensureUser } from './services/users.js'
App({onLaunch(){if(wx.cloud){wx.cloud.init({traceUser:true});ensureUser().catch(()=>{})}}})
