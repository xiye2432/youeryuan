import Taro from '@tarojs/taro'

// tabBar 页面白名单（与 taro-app/src/app.config.ts 保持一致）
const TAB_PAGES = new Set([
  '/pages/index/index',
  '/pages/students/index',
  '/pages/finance/index',
  '/pages/profile/index',
])

/**
 * 安全跳转：
 * - tabBar 页面：优先 switchTab
 * - 非 tabBar 页面：navigateTo
 * - 即使误用 switchTab，也会自动降级，避免报错
 */
export async function safeGo(url: string): Promise<void> {
  if (TAB_PAGES.has(url)) {
    try {
      // switchTab 在小程序里是异步的，这里兜底失败降级
      await Taro.switchTab({ url })
      return
    } catch (e) {
      // 极端情况（比如 url 配置变更），降级
      await Taro.navigateTo({ url })
      return
    }
  }

  await Taro.navigateTo({ url })
}

