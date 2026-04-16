import { PropsWithChildren, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { syncAllFromCloud } from './services/dataService'
import { AUTH_TOKEN_KEY } from './services/qideApi'
import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  
  useEffect(() => {
    // 应用启动时自动同步数据
    autoSyncOnLaunch()
  }, [])

  const autoSyncOnLaunch = async () => {
    const currentUser = Taro.getStorageSync('kt_current_user')
    if (!currentUser) {
      console.log('[App] 未登录，跳过自动同步')
      return
    }

    // 检查上次同步时间，避免频繁同步
    const lastSync = Taro.getStorageSync('kt_last_sync_time')
    if (lastSync) {
      const lastSyncTime = new Date(lastSync).getTime()
      const now = Date.now()
      const hoursSinceLastSync = (now - lastSyncTime) / (1000 * 60 * 60)
      
      // 1小时内不重复同步
      if (hoursSinceLastSync < 1) {
        console.log('[App] 1小时内已同步，跳过')
        return
      }
    }

    console.log('[App] 🚀 开始自动同步数据...')
    
    try {
      const campus = currentUser.campus
      const result = await syncAllFromCloud(campus)
      if (result.success) {
        console.log(`[App] ✅ 自动同步完成: 学生${result.students}条，教职工${result.staff}条 (${result.source})`)
      } else {
        console.warn(`[App] ⚠️ 自动同步失败: ${result.error}`)
      }
    } catch (err) {
      console.error('[App] 自动同步异常:', err)
    }
  }

  return children
}

export default App
