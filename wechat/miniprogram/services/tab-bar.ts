// @ts-nocheck
export function syncTabBar(page, selected) {
  page.getTabBar?.()?.setData({ selected })
}
