import Taro from '@tarojs/taro'
import { safeGo } from './nav'

export const DEFAULT_CAMPUSES = ['总园', '南江', '高新', '新市花园', '创越']
export const DEFAULT_CLASSES = ['托班', '小一班', '小二班', '中一班', '中二班', '大一班', '大二班']

const CAMPUS_ALIAS_MAP: Record<string, string> = {
  金星幼儿园: '总园',
  总园区: '总园',
}

export interface CurrentUser {
  id: string
  phone: string
  name: string
  role: string
  campus?: string
  profileCompleted?: boolean
  assignedClasses?: string[]
  managedClass?: string
  class?: string
  className?: string
}

export function getCurrentUser(): CurrentUser | null {
  const user = Taro.getStorageSync('kt_current_user')
  return user || null
}

export function normalizeCampusName(campus?: string | null): string {
  const value = (campus || '').trim()
  if (!value) return ''
  return CAMPUS_ALIAS_MAP[value] || value
}

export function campusMatches(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = normalizeCampusName(left)
  const normalizedRight = normalizeCampusName(right)
  if (!normalizedLeft || !normalizedRight) return true
  return normalizedLeft === normalizedRight
}

export function isTeacher(user?: CurrentUser | null): boolean {
  return (user?.role || '').toUpperCase() === 'TEACHER'
}

export function isFinance(user?: CurrentUser | null): boolean {
  return (user?.role || '').toUpperCase() === 'FINANCE'
}

export function isAdmin(user?: CurrentUser | null): boolean {
  const role = (user?.role || '').toUpperCase()
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export function getAssignedClasses(user?: CurrentUser | null): string[] {
  if (!user) return []

  const raw = [
    ...(Array.isArray(user.assignedClasses) ? user.assignedClasses : []),
    user.managedClass,
    user.class,
    user.className,
  ]

  return Array.from(new Set(raw.filter((item): item is string => !!item && !!item.trim()).map(item => item.trim())))
}

export function getAvailableClasses(campus?: string | null): string[] {
  const normalizedCampus = normalizeCampusName(campus)
  const classrooms = Taro.getStorageSync('kt_classrooms') || []
  const students = Taro.getStorageSync('kt_students') || []

  const classSet = new Set<string>()

  if (Array.isArray(classrooms)) {
    classrooms.forEach((item: any) => {
      const className = (item?.name || item?.className || item?.title || '').trim()
      const classCampus = normalizeCampusName(item?.campus || item?.branchName || item?.department || '')
      if (!className) return
      if (!normalizedCampus || campusMatches(classCampus, normalizedCampus)) {
        classSet.add(className)
      }
    })
  }

  if (Array.isArray(students)) {
    students.forEach((item: any) => {
      const className = (item?.class || item?.className || '').trim()
      const classCampus = normalizeCampusName(item?.campus || '')
      if (!className || className === '未分班') return
      if (!normalizedCampus || campusMatches(classCampus, normalizedCampus)) {
        classSet.add(className)
      }
    })
  }

  return Array.from(classSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function isProfileComplete(user?: CurrentUser | null): boolean {
  if (!user) return false

  const hasCampus = !!normalizeCampusName(user.campus)
  if (!hasCampus) return false

  if (isTeacher(user)) {
    return getAssignedClasses(user).length > 0
  }

  return user.profileCompleted !== false
}

export function updateStoredCurrentUser(patch: Partial<CurrentUser>): CurrentUser | null {
  const currentUser = getCurrentUser()
  if (!currentUser) return null

  const merged = {
    ...currentUser,
    ...patch,
  }

  merged.campus = normalizeCampusName(merged.campus)

  const assignedClasses = getAssignedClasses(merged)
  merged.assignedClasses = assignedClasses
  merged.managedClass = assignedClasses[0] || ''
  merged.profileCompleted = isProfileComplete(merged)

  Taro.setStorageSync('kt_current_user', merged)

  ;['kt_all_users', 'kt_test_users'].forEach((key) => {
    const list = Taro.getStorageSync(key)
    if (!Array.isArray(list)) return
    const next = list.map((item: CurrentUser) => item.id === merged.id ? { ...item, ...merged } : item)
    Taro.setStorageSync(key, next)
  })

  return merged
}

export function canAccessClass(user: CurrentUser | null | undefined, className?: string): boolean {
  if (!user) return false
  if (!isTeacher(user)) return true
  const assignedClasses = getAssignedClasses(user)
  if (!assignedClasses.length) return false
  return assignedClasses.includes((className || '').trim())
}

export function getPaymentClassName(payment: any): string {
  return payment?.studentClass || payment?.className || payment?.class || ''
}

export function redirectToProfileSetupIfNeeded(source = 'guard'): boolean {
  const user = getCurrentUser()
  if (!user || isProfileComplete(user)) return false

  const pages = Taro.getCurrentPages()
  const currentRoute = pages[pages.length - 1]?.route || ''
  if (currentRoute === 'pages/profile/setup') {
    return true
  }

  Taro.redirectTo({
    url: `/pages/profile/setup?from=${encodeURIComponent(source)}`,
  })
  return true
}

export function goHomeByRole(user?: CurrentUser | null) {
  const currentUser = user || getCurrentUser()
  if (!currentUser) {
    Taro.redirectTo({ url: '/pages/login/index' })
    return
  }

  const role = (currentUser.role || '').toUpperCase()
  if (role === 'KITCHEN') {
    Taro.redirectTo({ url: '/pages/kitchen/index' })
    return
  }
  if (role === 'FINANCE') {
    Taro.redirectTo({ url: '/pages/finance/index' })
    return
  }

  void safeGo('/pages/index/index')
}
