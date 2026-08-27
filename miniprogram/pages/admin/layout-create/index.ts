// @ts-nocheck
import { adminLayout, uploadWallImage } from '../../../services/layouts.js'

Page({
  data: { wallId: '', layoutName: '', imageFileId: '', imagePath: '', imageWidth: 0, imageHeight: 0, saving: false },
  onLoad(options) { this.setData({ wallId: options.wallId || '' }) },
  setLayoutName(e) { this.setData({ layoutName: e.detail.value }) },
  chooseImage() {
    wx.chooseImage({ count: 1, sizeType: ['original'], success: result => {
      const path = result.tempFilePaths[0]
      this.setData({ imagePath: path })
      wx.getImageInfo({ src: path, success: info => this.setData({ imageWidth: info.width, imageHeight: info.height }) })
      uploadWallImage(path, `layouts/${this.data.wallId}/${Date.now()}.jpg`)
        .then(upload => this.setData({ imageFileId: upload.fileID }))
        .catch(() => wx.showToast({ title: '图片上传失败', icon: 'none' }))
    } })
  },
  create() {
    if (!this.data.wallId || !this.data.layoutName || !this.data.imageFileId || !this.data.imageWidth || !this.data.imageHeight) return wx.showToast({ title: '请填写名称并上传有效墙图', icon: 'none' })
    this.setData({ saving: true })
    adminLayout('createLayout', { wallId: this.data.wallId, name: this.data.layoutName, imageFileId: this.data.imageFileId, imageWidth: this.data.imageWidth, imageHeight: this.data.imageHeight, geometryType: 'circle', holds: [] })
      .then(layout => wx.redirectTo({ url: `/pages/admin/layout-editor/index?wallId=${this.data.wallId}&layoutId=${layout.id}` }))
      .catch(error => wx.showToast({ title: error.message || '创建失败', icon: 'none' }))
      .finally(() => this.setData({ saving: false }))
  }
})
