// @ts-nocheck
import { currentUserIsAdmin } from '../../services/users.js'
import { uploadWallImage, createWall } from '../../services/walls.js'
import { normalizeUploadImage } from '../../services/image-processing.js'
import { cloudErrorMessage } from '../../services/errors.js'
const requestId=()=>`mini-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
Page({
  data:{allowed:false,checking:true,imagePath:'',name:'',saving:false,error:'',stage:'',creationPending:false},
  async onShow(){try{this.setData({allowed:await currentUserIsAdmin()})}catch(error){this.setData({allowed:false,error:cloudErrorMessage(error)})}finally{this.setData({checking:false})}},
  chooseImage(){if(!this.data.allowed||this.data.saving)return;wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],success:result=>{const file=result.tempFiles[0];if(!file)return;this.uploaded=null;this.payload=null;this.creation=null;this.requestId=requestId();this.setData({imagePath:file.tempFilePath,error:'',stage:'',creationPending:false,name:this.data.name||'新建墙面'})},fail:error=>{if(!String(error.errMsg).includes('cancel'))this.setData({error:cloudErrorMessage(error)})}})},
  setName(e){if(!this.data.saving && !this.data.creationPending)this.setData({name:e.detail.value})},
  async submit(){if(!this.data.allowed||this.data.saving)return;if(!this.data.imagePath||!this.data.name.trim()){this.setData({error:'请选择图片并填写墙面名称。'});return}
    this.setData({saving:true,error:''})
    try{
      if(!this.requestId)this.requestId=requestId()
      if(!this.uploaded){
        this.setData({stage:'正在处理并上传图片…'})
        if(!this.payload)this.payload=await normalizeUploadImage(this,this.data.imagePath)
        this.uploaded=await uploadWallImage({base64:this.payload,contentType:'image/jpeg',requestId:this.requestId})
      }
      this.setData({stage:'正在创建私有草稿…'})
      if(!this.creation)this.creation={name:this.data.name.trim(),imageFileId:this.uploaded.fileID,imageWidth:this.uploaded.imageWidth,imageHeight:this.uploaded.imageHeight,requestId:this.requestId}
      this.setData({creationPending:true})
      const wall=await createWall(this.creation)
      wx.redirectTo({url:`/pages/admin/wall-editor/index?wallId=${encodeURIComponent(wall.id)}`})
    }catch(error){this.setData({error:cloudErrorMessage(error),stage:'可重试上传，不会重复创建同一墙面。'})}finally{this.setData({saving:false})}
  },
})
