import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  getSyncStatus,
  syncAllFromCloud,
  checkCloudConnectivity,
  STORAGE_KEYS,
} from '../../services/dataService'
import { AUTH_TOKEN_KEY } from '../../services/qideApi'
import {
  getAssignedClasses,
  getCurrentUser,
  redirectToProfileSetupIfNeeded,
  updateStoredCurrentUser,
} from '../../utils/userAccess'
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
    isOnline: false,
  })

  useEffect(() => {
    loadUser()
    void checkCloud()
  }, [])

  useDidShow(() => {
    if (redirectToProfileSetupIfNeeded('profile')) return
    loadUser()
    void checkCloud()
  })

  const loadUser = () => {
    const userData = getCurrentUser()
    if (!userData) {
      setUser(null)
      return
    }
    setUser(userData)
    setEditName(userData.name)
  }

  const checkCloud = async () => {
    const syncStatus = getSyncStatus()
    setCloudStatus((prev) => ({
      ...prev,
      lastSync: syncStatus.lastSyncTime || undefined,
    }))

    try {
      const conn = await checkCloudConnectivity()
      setCloudStatus((prev) => ({
        ...prev,
        isOnline: conn.available,
        latency: conn.latency,
      }))
    } catch {
      setCloudStatus((prev) => ({
        ...prev,
        isOnline: false,
      }))
    }
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      SUPER_ADMIN: '超级管理员',
      ADMIN: '管理员',
      TEACHER: '教师',
      KITCHEN: '厨房',
      FINANCE: '财务',
      PARENT: '家长',
    }
    return labels[(role || '').toUpperCase()] || role
  }

  const handleSaveName = () => {
    if (!editName.trim()) {
      Taro.showToast({ title: '姓名不能为空', icon: 'none' })
      return
    }

    const nextUser = updateStoredCurrentUser({ name: editName.trim() })
    if (!nextUser) {
      Taro.showToast({ title: '用户不存在', icon: 'none' })
      return
    }

    setUser(nextUser)
    setIsEditing(false)
    Taro.showToast({ title: '保存成功', icon: 'success' })
  }

  const handleQuickSync = async () => {
    setIsSyncing(true)
    setSyncProgress('同步数据中...')

    try {
      const currentUser = getCurrentUser() || {}
      const result = await syncAllFromCloud(currentUser.campus, (current, total, key) => {
        setSyncProgress(`${key} 同步中... (${current}/${total})`)
      })

      if (result.success) {
        Taro.showToast({
          title: `学生${result.students}人，教职工${result.staff}人`,
          icon: 'success',
        })
      } else {
        Taro.showModal({
          title: '同步结果',
          content: `数据源：${result.source}\n学生：${result.students}\n教职工：${result.staff}\n${result.error || ''}`,
          showCancel: false,
        })
      }
      await checkCloud()
    } catch (error: any) {
      Taro.showToast({ title: error?.message || '同步失败', icon: 'none' })
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
        if (!res.confirm) return
        Taro.removeStorageSync('kt_current_user')
        Taro.removeStorageSync(AUTH_TOKEN_KEY)
        Taro.redirectTo({ url: '/pages/login/index' })
      },
    })
  }

  const handleClearCache = () => {
    Taro.showModal({
      title: '清除缓存',
      content: '这会清除本地缓存数据，但保留当前账号信息，是否继续？',
      success: (res) => {
        if (!res.confirm) return

        const currentUser = Taro.getStorageSync('kt_current_user')
        const authToken = Taro.getStorageSync(AUTH_TOKEN_KEY)
        const allUsers = Taro.getStorageSync('kt_all_users')
        const testUsers = Taro.getStorageSync('kt_test_users')

        Taro.clearStorageSync()

        if (currentUser) Taro.setStorageSync('kt_current_user', currentUser)
        if (authToken) Taro.setStorageSync(AUTH_TOKEN_KEY, authToken)
        if (allUsers) Taro.setStorageSync('kt_all_users', allUsers)
        if (testUsers) Taro.setStorageSync('kt_test_users', testUsers)

        Taro.showToast({ title: '缓存已清除', icon: 'success' })
      },
    })
  }

  const showLocalDataInfo = () => {
    const students = Taro.getStorageSync(STORAGE_KEYS.STUDENTS) || []
    const staff = Taro.getStorageSync(STORAGE_KEYS.STAFF) || []
    const payments = Taro.getStorageSync(STORAGE_KEYS.PAYMENTS) || []

    Taro.showModal({
      title: '本地数据详情',
      content: `学生：${students.length}\n教职工：${staff.length}\n缴费记录：${payments.length}\n数据源：${cloudStatus.isOnline ? '云端可用' : '本地模式'}`,
      showCancel: false,
    })
  }

  const getStorageInfo = () => {
    const info = Taro.getStorageInfoSync()
    return {
      currentSize: (info.currentSize / 1024).toFixed(2),
      limitSize: (info.limitSize / 1024).toFixed(2),
    }
  }

  const storageInfo = getStorageInfo()
  const assignedClasses = getAssignedClasses(user as any)

  const menuItems = [
    { icon: '📱', label: '我的手机', value: user?.phone || '-' },
    { icon: '🏫', label: '所属园区', value: user?.campus || '-' },
    { icon: '👩‍🏫', label: '负责班级', value: assignedClasses.length ? assignedClasses.join('、') : '未设置' },
    { icon: '🔐', label: '角色权限', value: user ? getRoleLabel(user.role) : '-' },
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
      <View className='user-card'>
        <View className='avatar'>
          <Text>{user.name.slice(0, 1)}</Text>
        </View>
        <View className='info'>
          {isEditing ? (
            <View className='edit-row'>
              <Input className='name-input' value={editName} onInput={(e) => setEditName(e.detail.value)} focus />
              <View className='edit-btns'>
                <Text className='cancel' onClick={() => { setIsEditing(false); setEditName(user.name) }}>取消</Text>
                <Text className='save' onClick={handleSaveName}>保存</Text>
              </View>
            </View>
          ) : (
            <View className='name-row' onClick={() => setIsEditing(true)}>
              <Text className='name'>{user.name}</Text>
              <Text className='edit-icon'>✎</Text>
            </View>
          )}
          <Text className='role'>{getRoleLabel(user.role)}</Text>
        </View>
      </View>

      <ScrollView className='content' scrollY>
        <View className='section cloud-section'>
          <Text className='section-title'>数据同步</Text>

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
            <View className='sync-btn quick' onClick={() => void handleQuickSync()}>
              <Text>同步数据</Text>
            </View>
          )}

          <View className='sync-btn info' onClick={showLocalDataInfo}>
            <Text>查看本地数据</Text>
          </View>
        </View>

        <View className='section'>
          <Text className='section-title'>基本信息</Text>
          {menuItems.map((item, index) => (
            <View key={index} className='menu-item'>
              <Text className='icon'>{item.icon}</Text>
              <Text className='label'>{item.label}</Text>
              <Text className='value'>{item.value}</Text>
            </View>
          ))}
          <View className='menu-item' onClick={() => Taro.navigateTo({ url: '/pages/profile/setup?from=profile' })}>
            <Text className='icon'>📝</Text>
            <Text className='label'>编辑园区/班级信息</Text>
            <Text className='arrow'>&gt;</Text>
          </View>
        </View>

        <View className='section'>
          <Text className='section-title'>设置</Text>

          <View className='menu-item'>
            <Text className='icon'>💾</Text>
            <Text className='label'>存储空间</Text>
            <Text className='value'>{storageInfo.currentSize}KB / {storageInfo.limitSize}KB</Text>
          </View>

          <View className='menu-item' onClick={handleClearCache}>
            <Text className='icon'>🗑</Text>
            <Text className='label'>清除缓存</Text>
            <Text className='arrow'>&gt;</Text>
          </View>

          <View className='menu-item'>
            <Text className='icon'>ℹ️</Text>
            <Text className='label'>版本</Text>
            <Text className='value'>v1.0.0</Text>
          </View>
        </View>

        <View className='logout-btn' onClick={handleLogout}>
          <Text>退出登录</Text>
        </View>

        <View style={{ height: '100rpx' }} />
      </ScrollView>
    </View>
  )
}
