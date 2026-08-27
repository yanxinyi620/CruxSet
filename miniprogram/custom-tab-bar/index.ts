// @ts-nocheck
const tabs = [
  { text: '线路', path: '/pages/walls/index' },
  { text: '创建', path: '/pages/create/index' },
  { text: '我的', path: '/pages/me/index' },
]

Component({
  data: { tabs, selected: 0 },
  pageLifetimes: {
    show() { this.syncSelected() },
  },
  methods: {
    syncSelected() {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      const index = tabs.findIndex(tab => tab.path.slice(1) === page?.route)
      if (index >= 0) this.setData({ selected: index })
    },
    switchTab(event) {
      const index = event.currentTarget.dataset.index
      if (index === this.data.selected) return
      wx.switchTab({ url: tabs[index].path })
    },
  },
})
