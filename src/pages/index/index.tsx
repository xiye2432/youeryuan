import { useState, useEffect } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { loadDashboardOverview, loadData as loadListData, loadPaymentsFromBackend, STORAGE_KEYS } from '../../services/dataService'
import { safeGo } from '../../utils/nav'


import './index.scss'

interface Student {
  id: string
  name: string
  class: string
}

interface DashboardData {
  totalStudents: number
  totalTeachers: number
  todayPresent: number
  todayAbsent: number
  monthPayments: number
  recentPayments: any[]
  classSummary: { name: string; count: number }[]
}

export default function Index() {
  const [data, setData] = useState<DashboardData>({
    totalStudents: 0,
    totalTeachers: 0,
    todayPresent: 0,
    todayAbsent: 0,
    monthPayments: 0,
    recentPayments: [],
    classSummary: []
  })
  const [currentUser, setCurrentUser] = useState<any>(null)
  const today = new Date().toISOString().split('T')[0]
  const isParent = currentUser?.role === 'PARENT'
  const isKitchen = currentUser?.role === 'KITCHEN'

    useEffect(() => {
    void loadData()
    loadUser()
    checkKitchenRedirect()
  }, [])

  useDidShow(() => {
    void loadData()
    loadUser()
    checkKitchenRedirect()
  })

  const checkKitchenRedirect = () => {
    const user = Taro.getStorageSync('kt_current_user')
    if (user?.role === 'KITCHEN') {
      Taro.redirectTo({ url: '/pages/kitchen/index' })
    } else if (user?.role === 'FINANCE') {
      Taro.redirectTo({ url: '/pages/finance/index' })
    }
  }


  const loadUser = () => {
    const user = Taro.getStorageSync('kt_current_user')
    setCurrentUser(user)
  }

    const loadData = async () => {
    const campus = Taro.getStorageSync('kt_current_user')?.campus
    const students: Student[] = await loadDataServiceStudents()
    const payments = await loadPaymentsFromBackend()
    const currentMonth = new Date().toISOString().slice(0, 7)
    const monthPayments = payments.filter((p: any) => p.paymentDate?.startsWith(currentMonth) || p.payDate?.startsWith(currentMonth))
    const monthTotal = monthPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0)

    const classMap = students.reduce((acc, s) => {
      const cls = s.class || '未分班'
      acc[cls] = (acc[cls] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    const classSummary = Object.entries(classMap).map(([name, count]) => ({ name, count }))

    let totalStudents = students.length
    let totalTeachers = (Taro.getStorageSync(STORAGE_KEYS.STAFF) || []).length
    let todayPresent = 0
    let todayAbsent = 0

    try {
      const overview = await loadDashboardOverview(campus)
      totalStudents = overview.studentCount
      totalTeachers = overview.staffCount
      todayPresent = overview.todayAttendance?.present || 0
      todayAbsent = Math.max((overview.todayAttendance?.total || 0) - todayPresent, 0)
    } catch {
      const todayAttendance = Taro.getStorageSync(`kt_attendance_${today}`) || {}
      todayPresent = Object.values(todayAttendance).filter((r: any) => r.status === 'present').length
      todayAbsent = Object.values(todayAttendance).filter((r: any) => r.status === 'absent').length
    }
    
    setData({
      totalStudents,
      totalTeachers,
      todayPresent,
      todayAbsent,
      monthPayments: monthTotal,
      recentPayments: payments.slice(0, 5),
      classSummary
    })
  }

    const loadDataServiceStudents = async () => {
    return await loadListData<Student>(STORAGE_KEYS.STUDENTS)
  }



  // 首页快捷操作固定顺序
  const getQuickActions = () => {
    const actions = [
      { icon: '📝', label: '考勤', path: '/pages/students/attendance' },
      { icon: '💰', label: '收费', path: '/pages/finance/payment' },
      { icon: '👥', label: '学生', path: '/pages/students/index' },
      { icon: '👨‍🏫', label: '教职工', path: '/pages/staff/index' },
      { icon: '🍲', label: '食谱', path: '/pages/kitchen/index' },
    ]

    if (isKitchen) {
      return actions.filter(action => action.label === '食谱')
    }

    if (isParent) {
      return actions.filter(action => !['考勤', '收费'].includes(action.label))
    }

    return actions
  }

  const quickActions = getQuickActions()

  const navigateTo = (path: string) => {
    const parentRestrictedPaths = new Set([
      '/pages/students/attendance',
      '/pages/finance/payment',
      '/pages/finance/index',
    ])

    const kitchenRestrictedPaths = new Set([
      '/pages/students/attendance',
      '/pages/finance/payment',
      '/pages/finance/index',
      '/pages/students/index',
      '/pages/staff/index',
    ])

    if (isParent && parentRestrictedPaths.has(path)) {
      Taro.showToast({ title: '家长账号无此功能权限', icon: 'none' })
      return
    }

    if (isKitchen && kitchenRestrictedPaths.has(path)) {
      Taro.showToast({ title: '厨房账号无此功能权限', icon: 'none' })
      return
    }

    safeGo(path)
  }

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  return (
    <View className='index-page'>
      {/* 顶部问候 */}
      <View className='header'>
        <View className='greeting'>
          <Text className='hello'>您好，</Text>
          <Text className='name'>{currentUser?.name || '老师'}</Text>
        </View>
        <Text className='date'>{new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      </View>

      <ScrollView className='content' scrollY>
        {/* 快捷操作 */}
        <View className='quick-actions'>
          {quickActions.map(action => (
            <View key={action.label} className='action-item' onClick={() => navigateTo(action.path)}>
              <View className='icon-wrap'>
                <Text className='icon'>{action.icon}</Text>
              </View>
              <Text className='label'>{action.label}</Text>
            </View>
          ))}
        </View>

        {/* 今日概览 */}
        <View className='section'>
          <Text className='section-title'>📊 今日概览</Text>
          <View className='stats-grid'>
            {isKitchen ? (
              <View className='stat-card green'>
                <Text className='number'>{data.todayPresent}</Text>
                <Text className='label'>今日出勤</Text>
              </View>
            ) : (
              <>
                <View className='stat-card blue'>
                  <Text className='number'>{data.totalStudents}</Text>
                  <Text className='label'>在园学生</Text>
                </View>
                <View className='stat-card gold'>
                  <Text className='number'>{data.totalTeachers}</Text>
                  <Text className='label'>教职工</Text>
                </View>
                <View className='stat-card green'>
                  <Text className='number'>{data.todayPresent}</Text>
                  <Text className='label'>今日出勤</Text>
                </View>
                <View className='stat-card rose'>
                  <Text className='number'>{data.todayAbsent}</Text>
                  <Text className='label'>今日缺勤</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {!isKitchen && data.classSummary.length > 0 && (
          <View className='section'>
            <Text className='section-title'>🏫 班级分布</Text>
            <View className='class-grid'>
              {data.classSummary.map(cls => (
                <View key={cls.name} className='class-item'>
                  <Text className='class-name'>{cls.name}</Text>
                  <Text className='class-count'>{cls.count}人</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!isKitchen && data.recentPayments.length > 0 && (
          <View className='section'>
            <View className='section-header'>
              <Text className='section-title'>💳 最近缴费</Text>
              <Text className='more' onClick={() => safeGo('/pages/finance/index')}>查看全部 &gt;</Text>
            </View>
            <View className='payment-list'>
              {data.recentPayments.map((payment, index) => (
                <View key={index} className='payment-item'>
                  <View className='payment-info'>
                    <Text className='student-name'>{payment.studentName}</Text>
                    <Text className='payment-date'>{formatDate(payment.paymentDate)}</Text>
                  </View>
                  <Text className='payment-amount'>¥{payment.amount.toLocaleString()}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View className='section'>
          <Text className='section-title'>🧭 功能导航</Text>
          <View className='nav-grid'>
            {isKitchen ? (
              <View className='nav-item' onClick={() => navigateTo('/pages/kitchen/index')}>
                <Text className='nav-icon'>🥗</Text>
                <Text className='nav-label'>本周食谱</Text>
              </View>
            ) : (
              <>
                <View className='nav-item' onClick={() => Taro.navigateTo({ url: '/pages/staff/index' })}>
                  <Text className='nav-icon'>👨‍🏫</Text>
                  <Text className='nav-label'>教职工</Text>
                </View>

                {currentUser?.role !== 'PARENT' && (
                  <View className='nav-item' onClick={() => navigateTo('/pages/finance/index')}>
                    <Text className='nav-icon'>📈</Text>
                    <Text className='nav-label'>财务报表</Text>
                  </View>
                )}

                {['SUPER_ADMIN', 'ADMIN', 'TEACHER'].includes(currentUser?.role) && (
                  <View className='nav-item' onClick={() => navigateTo('/pages/students/index')}>
                    <Text className='nav-icon'>📋</Text>
                    <Text className='nav-label'>学生档案</Text>
                  </View>
                )}
                
                <View className='nav-item' onClick={() => navigateTo('/pages/kitchen/index')}>
                  <Text className='nav-icon'>🥗</Text>
                  <Text className='nav-label'>本周食谱</Text>
                </View>
                
                {currentUser?.role === 'PARENT' && (
                  <View className='nav-item' onClick={() => navigateTo('/pages/profile/index')}>
                    <Text className='nav-icon'>👪</Text>
                    <Text className='nav-label'>家园互通</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        <View style={{ height: '100rpx' }}></View>
      </ScrollView>
    </View>
  )
}
