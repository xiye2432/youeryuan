import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  getSyncStatus,
  hasBackendAuth,
  syncAllFromCloud,
  checkCloudConnectivity,
  STORAGE_KEYS
} from '../../services/dataService'
import { AUTH_TOKEN_KEY } from '../../services/qideApi'
import './index.scss'

interface User {
  id: string
  phone: string
  name: string
  role: string
  campus?: string
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState('')
  const [cloudStatus, setCloudStatus] = useState<{
    isOnline: boolean
    latency?: number
    lastSync?: string
  }>({
    isOnline: false
  })

  useEffect(() => {
    loadUser()
    checkCloud()
  }, [])

  const loadUser = () => {
    const userData = Taro.getStorageSync('kt_current_user')
    if (userData) {
      setUser(userData)
      setEditName(userData.name)
    }
  }

  const checkCloud = async () => {
    const syncStatus = getSyncStatus()
    setCloudStatus(prev => ({
      ...prev,
      lastSync: syncStatus.lastSyncTime || undefined
    }))

    try {
      const conn = await checkCloudConnectivity()
      setCloudStatus(prev => ({
        ...prev,
        isOnline: conn.available,
        latency: conn.latency,
      }))
    } catch {
      setCloudStatus(prev => ({
        ...prev,
        isOnline: false,
      }))
    }
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      SUPER_ADMIN: '超级管理员',
      admin: '管理员',
      teacher: '教师',
      kitchen: '厨房',
      finance: '财务'
    }
    return labels[role] || role
  }

  const handleSaveName = () => {
    if (!editName.trim()) {
      Taro.showToast({ title: '姓名不能为空', icon: 'none' })
      return
    }

    if (user) {
      const updatedUser = { ...user, name: editName }
      Taro.setStorageSync('kt_current_user', updatedUser)
      
      const users = Taro.getStorageSync('kt_all_users') || []
      const index = users.findIndex((u: User) => u.id === user.id)
      if (index !== -1) {
        users[index] = updatedUser
        Taro.setStorageSync('kt_all_users', users)
      }
      
      setUser(updatedUser)
      setIsEditing(false)
      Taro.showToast({ title: '保存成功', icon: 'success' })
    }
  }

  const handleUpload = async () => {
    Taro.showToast({ title: '当前版本使用后端同步，无需手动上传云端', icon: 'none' })
  }

  const handleDownload = async () => {
    await handleQuickSync()
  }

  const handleQuickSync = async () => {
    setIsSyncing(true)
    setSyncProgress('同步数据中...')

    try {
      const currentUser = Taro.getStorageSync('kt_current_user') || {}
      const campus = currentUser.campus
      const result = await syncAllFromCloud(campus, (current, total, key) => {
        setSyncProgress(`${key} 同步中... (${current}/${total})`)
      })

      if (result.success) {
        Taro.showToast({
          title: `学生${result.students}人 教职工${result.staff}人 (${result.source})`,
          icon: 'success'
        })
      } else {
        Taro.showModal({
          title: '同步结果',
          content: `数据源: ${result.source}\n学生: ${result.students}人\n教职工: ${result.staff}人\n${result.error || ''}`,
          showCancel: false,
        })
      }
      console.log('[Profile] 同步完成:', result)
      checkCloud()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '同步失败', icon: 'none' })
    } finally {
      setIsSyncing(false)
      setSyncProgress('')
    }
  }

  const handleLogout = () => {
    Taro.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          Taro.removeStorageSync('kt_current_user')
          Taro.removeStorageSync(AUTH_TOKEN_KEY)
          Taro.redirectTo({ url: '/pages/login/index' })
        }
      }
    })
  }

  const handleClearCache = () => {
    Taro.showModal({
      title: '清除缓存',
      content: '这将清除本地缓存数据（不包括账号信息），确定？',
      success: (res) => {
        if (res.confirm) {
          const currentUser = Taro.getStorageSync('kt_current_user')
          const allUsers = Taro.getStorageSync('kt_all_users')
          const authorizedPhones = Taro.getStorageSync('kt_authorized_phones')
          
          Taro.clearStorageSync()
          
          if (currentUser) Taro.setStorageSync('kt_current_user', currentUser)
          if (allUsers) Taro.setStorageSync('kt_all_users', allUsers)
          if (authorizedPhones) Taro.setStorageSync('kt_authorized_phones', authorizedPhones)
          
          Taro.showToast({ title: '缓存已清除', icon: 'success' })
        }
      }
    })
  }

  // 清空所有数据并重新从后端同步
  const handleClearAndResync = async () => {
    Taro.showModal({
      title: '清空并重新同步',
      content: '将清空所有本地数据，然后从后端重新下载学生和教职工信息，确定？',
      success: async (res) => {
        if (res.confirm) {
          setIsSyncing(true)
          setSyncProgress('清空本地数据...')
          
          // 保留账号信息
          const currentUser = Taro.getStorageSync('kt_current_user')
          const authToken = Taro.getStorageSync(AUTH_TOKEN_KEY)
          const allUsers = Taro.getStorageSync('kt_all_users')
          
          // 清空所有存储
          Taro.clearStorageSync()
          
          // 恢复账号信息
          if (currentUser) Taro.setStorageSync('kt_current_user', currentUser)
          if (authToken) Taro.setStorageSync(AUTH_TOKEN_KEY, authToken)
          if (allUsers) Taro.setStorageSync('kt_all_users', allUsers)
          
          console.log('[Profile] 本地数据已清空')
          
          // 验证清空成功
          const afterClear = Taro.getStorageSync(STORAGE_KEYS.STUDENTS)
          console.log('[Profile] 清空后学生数据:', afterClear?.length || 0)
          
          // 重新从云端下载所有数据
          setSyncProgress('从云端下载数据...')
          
          try {
            const currentUser2 = Taro.getStorageSync('kt_current_user') || {}
            const campus = currentUser2.campus
            const result = await syncAllFromCloud(campus, (current, total, key) => {
              setSyncProgress(`${key} 下载中... (${current}/${total})`)
            })
            
            Taro.showModal({
              title: result.success ? '同步成功' : '同步结果',
              content: `数据源: ${result.source}\n学生: ${result.students} 人\n教职工: ${result.staff} 人\n${result.error || ''}\n\n请返回学生页面查看`,
              showCancel: false
            })
            checkCloud()
          } catch (err: any) {
            Taro.showToast({ title: err.message || '同步失败', icon: 'none' })
          } finally {
            setIsSyncing(false)
            setSyncProgress('')
          }
        }
      }
    })
  }

  // 查看本地数据详情
  const showLocalDataInfo = () => {
    const students = Taro.getStorageSync(STORAGE_KEYS.STUDENTS) || []
    const staff = Taro.getStorageSync(STORAGE_KEYS.STAFF) || []
    const phones = Taro.getStorageSync(STORAGE_KEYS.AUTHORIZED_PHONES) || []
    
    Taro.showModal({
      title: '本地数据详情',
      content: `学生: ${students.length} 人\n教职工: ${staff.length} 人\n授权手机: ${phones.length} 个\n\n数据源: ${cloudStatus.isOnline ? '云端可用' : '本地模式'}`,
      showCancel: false
    })
  }

  const getStorageInfo = () => {
    const info = Taro.getStorageInfoSync()
    return {
      currentSize: (info.currentSize / 1024).toFixed(2),
      limitSize: (info.limitSize / 1024).toFixed(2)
    }
  }

  const storageInfo = getStorageInfo()

  const menuItems = [
    { icon: '📱', label: '我的手机', value: user?.phone || '-' },
    { icon: '🏫', label: '所属园所', value: user?.campus || '金星幼儿园' },
    { icon: '👤', label: '角色权限', value: user ? getRoleLabel(user.role) : '-' },
  ]

  if (!user) {
    return (
      <View className='profile-page'>
        <View className='not-logged'>
          <Text className='icon'>👤</Text>
          <Text className='text'>未登录</Text>
          <View className='login-btn' onClick={() => Taro.redirectTo({ url: '/pages/login/index' })}>
            <Text>去登录</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='profile-page'>
      {/* 用户卡片 */}
      <View className='user-card'>
        <View className='avatar'>
          <Text>{user.name.slice(0, 1)}</Text>
        </View>
        <View className='info'>
          {isEditing ? (
            <View className='edit-row'>
              <Input
                className='name-input'
                value={editName}
                onInput={(e) => setEditName(e.detail.value)}
                focus
              />
              <View className='edit-btns'>
                <Text className='cancel' onClick={() => { setIsEditing(false); setEditName(user.name) }}>取消</Text>
                <Text className='save' onClick={handleSaveName}>保存</Text>
              </View>
            </View>
          ) : (
            <View className='name-row' onClick={() => setIsEditing(true)}>
              <Text className='name'>{user.name}</Text>
              <Text className='edit-icon'>✏️</Text>
            </View>
          )}
          <Text className='role'>{getRoleLabel(user.role)}</Text>
        </View>
      </View>

      <ScrollView className='content' scrollY>
        {/* 后端同步 */}
        <View className='section cloud-section'>
          <Text className='section-title'>🔄 后端同步</Text>
          
          <View className='cloud-status'>
            <View className='status-row'>
              <Text className='label'>连接状态</Text>
              <View className='status-indicator'>
                <View className={`dot ${cloudStatus.isOnline ? 'online' : 'offline'}`} />
                <Text className={cloudStatus.isOnline ? 'online' : 'offline'}>
                  {cloudStatus.isOnline ? '已连接' : '未连接'}
                </Text>
              </View>
            </View>
            
            {cloudStatus.latency && (
              <View className='status-row'>
                <Text className='label'>网络延迟</Text>
                <Text className='value'>{cloudStatus.latency}ms</Text>
              </View>
            )}
            
            {cloudStatus.lastSync && (
              <View className='status-row'>
                <Text className='label'>上次同步</Text>
                <Text className='value'>{new Date(cloudStatus.lastSync).toLocaleString()}</Text>
              </View>
            )}
          </View>

          {isSyncing ? (
            <View className='sync-btn syncing'>
              <Text>{syncProgress || '同步中...'}</Text>
            </View>
          ) : (
            <>
              <View className='sync-btn danger' onClick={handleClearAndResync}>
                <Text>🔄 清空并重新同步</Text>
              </View>
              
              <View className='sync-btn quick' onClick={handleQuickSync}>
                <Text>⚡ 同步数据</Text>
              </View>

              <View className='sync-btn' onClick={handleUpload}>
                <Text>☁️ 云端上传已停用</Text>
              </View>
            </>
          )}
          
          {/* 查看本地数据按钮 */}
          <View className='sync-btn info' onClick={showLocalDataInfo}>
            <Text>📊 查看本地数据</Text>
          </View>
          
          <Text className='sync-hint'>
            自动选择数据源：后端API → 阿里云OSS → 本地缓存
          </Text>
        </View>

        {/* 基本信息 */}
        <View className='section'>
          <Text className='section-title'>基本信息</Text>
          {menuItems.map((item, index) => (
            <View key={index} className='menu-item'>
              <Text className='icon'>{item.icon}</Text>
              <Text className='label'>{item.label}</Text>
              <Text className='value'>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* 设置 */}
        <View className='section'>
          <Text className='section-title'>设置</Text>
          
          <View className='menu-item'>
            <Text className='icon'>📦</Text>
            <Text className='label'>存储空间</Text>
            <Text className='value'>{storageInfo.currentSize}KB / {storageInfo.limitSize}KB</Text>
          </View>
          
          <View className='menu-item' onClick={handleClearCache}>
            <Text className='icon'>🗑️</Text>
            <Text className='label'>清除缓存</Text>
            <Text className='arrow'>&gt;</Text>
          </View>
          
          <View className='menu-item'>
            <Text className='icon'>ℹ️</Text>
            <Text className='label'>版本</Text>
            <Text className='value'>v1.0.0</Text>
          </View>
        </View>

        {/* 退出登录 */}
        <View className='logout-btn' onClick={handleLogout}>
          <Text>退出登录</Text>
        </View>

        <View style={{ height: '100rpx' }}></View>
      </ScrollView>
    </View>
  )
}
