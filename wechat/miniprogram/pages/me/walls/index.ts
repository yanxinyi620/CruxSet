// @ts-nocheck
import { listMyWalls } from '../../../services/walls.js'
import { cloudErrorMessage } from '../../../services/errors.js'
import { confirmWallDeletion } from '../../../services/wall-deletion.js'
Page({
  data:{walls:[],loading:true,error:'',notice:'',deleting:''},
  onShow(){return this.reload()},
  async reload(){this.setData({loading:true,error:''});try{this.setData({walls:(await listMyWalls()).sort((a,b)=>b.updatedAt-a.updatedAt||b.id.localeCompare(a.id))})}catch(error){this.setData({error:cloudErrorMessage(error)})}finally{this.setData({loading:false})}},
  remove(e){return confirmWallDeletion(this,e.currentTarget.dataset.wallId)},
})
