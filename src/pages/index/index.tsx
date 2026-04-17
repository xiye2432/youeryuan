import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { loadData, loadPaymentsFromBackend, STORAGE_KEYS } from '../../services/dataService'
import { safeGo } from '../../utils/nav'
import {
  getAssignedClasses,
  isAdmin,
  getCurrentUser,
  getPaymentClassName,
  isTeacher,
  redirectToProfileSetupIfNeeded,
} from '../../utils/userAccess'
import './index.scss'

interface Student {
  id: string
  name: string
  class?: string
  className?: string
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

const getStudentClass = (student: Student) => student.class || student.className || '未分班'

export default function Index() {
  const [data, setData] = useState<DashboardData>({
    totalStudents: 0,
    totalTeachers: 0,
    todayPresent: 0,
    todayAbsent: 0,
    monthPayments: 0,
    recentPayments: [],
    classSummary: [],
  })
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    loadCurrentUser()
    void loadDashboard()
  }, [])

  useDidShow(() => {
    if (redirectToProfileSetupIfNeeded('index')) return
    loadCurrentUser()
    void loadDashboard()
  })

  const loadCurrentUser = () => {
    const user = getCurrentUser()
    setCurrentUser(user)

    const role = (user?.role || '').toUpperCase()
    if (role === 'KITCHEN') {
      Taro.redirectTo({ url: '/pages/kitchen/index' })
      return
    }
    if (role === 'FINANCE') {
      Taro.redirectTo({ url: '/pages/finance/index' })
    }
  }

  const loadDashboard = async () => {
    const user = getCurrentUser()
    const teacherRole = isTeacher(user)
    const adminRole = isAdmin(user)
    const assignedClasses = getAssignedClasses(user)
    const scopedByClass = teacherRole && assignedClasses.length > 0
    const campus = adminRole || scopedByClass ? undefined : user?.campus

    const students = await loadData<Student>(STORAGE_KEYS.STUDENTS, { campus })
    const visibleStudents = teacherRole && assignedClasses.length
      ? students.filter((student) => assignedClasses.includes(getStudentClass(student)))
      : students

    const payments = await loadPaymentsFromBackend({
      campus,
      classNames: teacherRole ? assignedClasses : undefined,
    })

    const currentMonth = new Date().toISOString().slice(0, 7)
    const monthPayments = payments.filter((payment: any) => payment.paymentDate?.startsWith(currentMonth))
    const monthTotal = monthPayments.reduce((sum: number, payment: any) => sum + (payment.amount || 0), 0)

    const classMap = visibleStudents.reduce((acc, student) => {
      const className = getStudentClass(student)
      acc[className] = (acc[className] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const today = new Date().toISOString().split('T')[0]
    const attendanceMap = Taro.getStorageSync(`kt_attendance_${today}`) || {}
    const visibleStudentIds = new Set(visibleStudents.map((student) => student.id))

    let todayPresent = 0
    let todayAbsent = 0
    Object.entries(attendanceMap).forEach(([studentId, record]: any) => {
      if (!visibleStudentIds.has(studentId)) return
      if (record?.status === 'present') todayPresent += 1
      if (record?.status === 'absent') todayAbsent += 1
    })

    setData({
      totalStudents: visibleStudents.length,
      totalTeachers: (Taro.getStorageSync(STORAGE_KEYS.STAFF) || []).length,
      todayPresent,
      todayAbsent,
      monthPayments: monthTotal,
      recentPayments: payments.slice(0, 5),
      classSummary: Object.entries(classMap).map(([name, count]) => ({ name, count })),
    })
  }

  const isParent = (currentUser?.role || '').toUpperCase() === 'PARENT'
  const isKitchen = (currentUser?.role || '').toUpperCase() === 'KITCHEN'
  const teacherRole = isTeacher(currentUser)

  const getQuickActions = () => {
    const actions = [
      { icon: '📝', label: '考勤', path: '/pages/students/attendance' },
      { icon: '💰', label: '收费概览', path: '/pages/finance/index' },
      { icon: '👦', label: '学生', path: '/pages/students/index' },
      { icon: '👩‍🏫', label: '教职工', path: '/pages/staff/index' },
      { icon: '🍽', label: '食谱', path: '/pages/kitchen/index' },
    ]

    if (isKitchen) {
      return actions.filter((action) => action.path === '/pages/kitchen/index')
    }
    if (isParent) {
      return actions.filter((action) => !['/pages/students/attendance', '/pages/finance/index'].includes(action.path))
    }
    return actions
  }

  const navigateTo = (path: string) => {
    const parentRestrictedPaths = new Set([
      '/pages/students/attendance',
      '/pages/finance/index',
      '/pages/finance/payment',
    ])

    const kitchenRestrictedPaths = new Set([
      '/pages/students/attendance',
      '/pages/finance/index',
      '/pages/finance/payment',
      '/pages/students/index',
      '/pages/staff/index',
    ])

    if (isParent && parentRestrictedPaths.has(path)) {
      Taro.showToast({ title: '家长账号暂无此功能权限', icon: 'none' })
      return
    }

    if (isKitchen && kitchenRestrictedPaths.has(path)) {
      Taro.showToast({ title: '厨房账号暂无此功能权限', icon: 'none' })
      return
    }

    void safeGo(path)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  return (
    <View className='index-page'>
      <View className='header'>
        <View className='greeting'>
          <Text className='hello'>您好，</Text>
          <Text className='name'>{currentUser?.name || '老师'}</Text>
        </View>
        <Text className='date'>{new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      </View>

      <ScrollView className='content' scrollY>
        <View className='quick-actions'>
          {getQuickActions().map((action) => (
            <View key={action.label} className='action-item' onClick={() => navigateTo(action.path)}>
              <View className='icon-wrap'>
                <Text className='icon'>{action.icon}</Text>
              </View>
              <Text className='label'>{action.label}</Text>
            </View>
          ))}
        </View>

        <View className='section'>
          <Text className='section-title'>今日概览</Text>
          <View className='stats-grid'>
            <View className='stat-card blue'>
              <Text className='number'>{data.totalStudents}</Text>
              <Text className='label'>{teacherRole ? '本班学生' : '在园学生'}</Text>
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
          </View>
        </View>

        {!isKitchen && data.classSummary.length > 0 && (
          <View className='section'>
            <Text className='section-title'>{teacherRole ? '本班人数' : '班级分布'}</Text>
            <View className='class-grid'>
              {data.classSummary.map((item) => (
                <View key={item.name} className='class-item'>
                  <Text className='class-name'>{item.name}</Text>
                  <Text className='class-count'>{item.count}人</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!isKitchen && data.recentPayments.length > 0 && (
          <View className='section'>
            <View className='section-header'>
              <Text className='section-title'>{teacherRole ? '本班最近缴费' : '最近缴费'}</Text>
              <Text className='more' onClick={() => navigateTo('/pages/finance/index')}>查看全部 &gt;</Text>
            </View>
            <View className='payment-list'>
              {data.recentPayments.map((payment, index) => (
                <View key={index} className='payment-item'>
                  <View className='payment-info'>
                    <Text className='student-name'>{payment.studentName}</Text>
                    <Text className='payment-date'>
                      {getPaymentClassName(payment)} · {formatDate(payment.paymentDate)}
                    </Text>
                  </View>
                  <Text className='payment-amount'>¥{payment.amount.toLocaleString()}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View className='section'>
          <Text className='section-title'>功能导航</Text>
          <View className='nav-grid'>
            <View className='nav-item' onClick={() => navigateTo('/pages/students/index')}>
              <Text className='nav-icon'>👦</Text>
              <Text className='nav-label'>{teacherRole ? '本班学生' : '学生档案'}</Text>
            </View>

            {!isParent && (
              <View className='nav-item' onClick={() => navigateTo('/pages/finance/index')}>
                <Text className='nav-icon'>📊</Text>
                <Text className='nav-label'>{teacherRole ? '本班收费' : '财务报表'}</Text>
              </View>
            )}

            <View className='nav-item' onClick={() => navigateTo('/pages/staff/index')}>
              <Text className='nav-icon'>👩‍🏫</Text>
              <Text className='nav-label'>教职工</Text>
            </View>

            <View className='nav-item' onClick={() => navigateTo('/pages/kitchen/index')}>
              <Text className='nav-icon'>🍽</Text>
              <Text className='nav-label'>本周食谱</Text>
            </View>
          </View>
        </View>

        <View style={{ height: '100rpx' }} />
      </ScrollView>
    </View>
  )
}
