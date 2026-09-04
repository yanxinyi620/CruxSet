// @ts-nocheck
const tabs = [
  { text: '线路', path: '/pages/walls/index' },
  { text: '创建', path: '/pages/create/index' },
  { text: '我的', path: '/pages/me/index' },
]

Component({
  data: { tabs, selected: 0 },
  lifetimes: {
    attached() { this.syncSelected() },
  },
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
      const index = Number(event.currentTarget.dataset.index)
      if (!Number.isInteger(index) || !tabs[index]) return
      this.setData({ selected: index })
      if (index === this.data.selected && tabs[index].path.slice(1) === getCurrentPages().at(-1)?.route) return
      wx.switchTab({ url: tabs[index].path })
    },
  },
})
