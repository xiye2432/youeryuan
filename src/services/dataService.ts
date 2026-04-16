/**
 * 统一数据服务 - 小程序版
 * 数据源优先级：qide-api 后端 → 阿里云 OSS 公共读 → 本地缓存
 */

import Taro from '@tarojs/taro'
import { AUTH_TOKEN_KEY, fetchEduBootstrapToStorage, fetchMealsFromQideApi, saveMealToQideApi, isLocalTestToken } from './qideApi'
import { downloadFromAliyun, downloadAllData as ossDownloadAll, checkAliyunHealth } from './aliyunOssService'

// 存储键定义
export const STORAGE_KEYS = {
  STUDENTS: 'kt_students',
  STAFF: 'kt_staff',
  STUDENT_EVALUATIONS: 'kt_student_evaluations',
  AUTHORIZED_PHONES: 'kt_authorized_phones',
  ALL_USERS: 'kt_all_users',
  PAYMENTS: 'kt_payments',
  KITCHEN_HISTORY: 'kt_kitchen_history_v2',
  MEAL_PLANS: 'kt_meal_plans',
}

// 同步状态
let lastSyncTime: string | null = Taro.getStorageSync('kt_last_sync_time') || null
let isSyncing = false

function getBackendToken(): string {
  return Taro.getStorageSync(AUTH_TOKEN_KEY) || ''
}

/** 是否持有真实后端 token（非本地测试 token） */
export function hasBackendAuth(): boolean {
  const token = getBackendToken()
  return !!token && !isLocalTestToken(token)
}

export function getSyncStatus() {
  return {
    lastSyncTime,
    isSyncing,
  }
}

/**
 * 从数据源加载数据
 * 优先级：qide-api bootstrap → 阿里云 OSS 公共读 → 本地缓存
 */
export async function loadData<T>(storageKey: string, options?: {
  campus?: string
  forceCloud?: boolean
}): Promise<T[]> {
  // 1. 真实后端 token → 走 qide-api bootstrap
  if (hasBackendAuth() && (storageKey === STORAGE_KEYS.STUDENTS || storageKey === STORAGE_KEYS.STAFF)) {
    try {
      await fetchEduBootstrapToStorage(getBackendToken())
      const list = (Taro.getStorageSync(storageKey) || []) as T[]
      if (options?.campus) {
        const filtered = list.filter((item: any) => !item?.campus || item.campus === options.campus)
        Taro.setStorageSync(storageKey, filtered)
        return filtered
      }
      return list
    } catch (err) {
      console.warn('[dataService] qide-api 加载失败，尝试 OSS 回退:', err)
    }
  }

  // 2. 阿里云 OSS 公共读回退（对所有人均可，无需 token）
  if (storageKey === STORAGE_KEYS.STUDENTS || storageKey === STORAGE_KEYS.STAFF) {
    try {
      const ossData = await downloadFromAliyun<T>(storageKey)
      if (ossData && ossData.length > 0) {
        Taro.setStorageSync(storageKey, ossData)
        if (options?.campus) {
          return ossData.filter((item: any) => !item?.campus || item.campus === options.campus)
        }
        return ossData
      }
    } catch (err) {
      console.warn('[dataService] OSS 加载失败，使用本地缓存:', err)
    }
  }

  // 3. 本地缓存
  return Taro.getStorageSync(storageKey) || []
}

/**
 * 保存单条数据（本地优先）
 */
export async function saveItem<T extends { id: string }>(
  storageKey: string,
  item: T,
  _options?: { skipCloud?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing: T[] = Taro.getStorageSync(storageKey) || []
    const index = existing.findIndex(i => i.id === item.id)
    if (index >= 0) {
      existing[index] = item
    } else {
      existing.push(item)
    }
    Taro.setStorageSync(storageKey, existing)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * 删除数据
 */
export async function deleteItem<T extends { id: string }>(
  storageKey: string,
  itemId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing: T[] = Taro.getStorageSync(storageKey) || []
    const filtered = existing.filter(i => i.id !== itemId)
    Taro.setStorageSync(storageKey, filtered)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * 批量保存数据
 */
export async function saveAll<T extends { id: string }>(
  storageKey: string,
  items: T[]
): Promise<{ success: boolean; error?: string }> {
  try {
    Taro.setStorageSync(storageKey, items)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * 一键同步（从云端/后端下载到本地）
 * 优先 qide-api，回退阿里云 OSS
 */
export async function syncAllFromCloud(
  campus?: string,
  onProgress?: (current: number, total: number, key: string) => void
): Promise<{
  success: boolean
  source: string
  students: number
  staff: number
  error?: string
}> {
  isSyncing = true

  try {
    // 1. 尝试 qide-api bootstrap
    if (hasBackendAuth()) {
      onProgress?.(1, 2, 'qide-api')
      try {
        const result = await fetchEduBootstrapToStorage(getBackendToken())
        lastSyncTime = new Date().toISOString()
        Taro.setStorageSync('kt_last_sync_time', lastSyncTime)
        isSyncing = false
        return {
          success: true,
          source: 'qide-api',
          students: result.students,
          staff: result.staff,
        }
      } catch (err: any) {
        console.warn('[dataService] qide-api 同步失败，回退 OSS:', err)
      }
    }

    // 2. 回退阿里云 OSS
    onProgress?.(1, 2, 'aliyun-oss')
    try {
      const result = await ossDownloadAll()
      lastSyncTime = new Date().toISOString()
      Taro.setStorageSync('kt_last_sync_time', lastSyncTime)
      isSyncing = false
      return {
        success: result.success,
        source: 'aliyun-oss',
        students: result.students,
        staff: result.staff,
        error: result.error,
      }
    } catch (err: any) {
      isSyncing = false
      return {
        success: false,
        source: 'none',
        students: 0,
        staff: 0,
        error: err.message || '同步失败',
      }
    }
  } catch (err: any) {
    isSyncing = false
    return {
      success: false,
      source: 'none',
      students: 0,
      staff: 0,
      error: err.message || '同步异常',
    }
  }
}

/**
 * 考勤数据专用 - 保存
 */
export async function saveAttendanceData(
  date: string,
  studentId: string,
  record: any
): Promise<{ success: boolean; error?: string }> {
  const storageKey = `kt_attendance_${date}`
  const existing = Taro.getStorageSync(storageKey) || {}
  existing[studentId] = record
  Taro.setStorageSync(storageKey, existing)
  return { success: true }
}

/**
 * 考勤数据专用 - 加载
 */
export async function loadAttendanceData(
  date: string,
  _campus?: string
): Promise<Record<string, any>> {
  const storageKey = `kt_attendance_${date}`
  return Taro.getStorageSync(storageKey) || {}
}

// --- 成长评价 ---

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(id: string | undefined | null): boolean {
  return !!id && UUID_RE.test(id)
}

export function randomUuidV4(): string {
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = (Math.random() * 256) | 0
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export async function loadStudentEvaluations(): Promise<Record<string, any>[]> {
  const local = Taro.getStorageSync(STORAGE_KEYS.STUDENT_EVALUATIONS) || []
  return Array.isArray(local) ? local : []
}

export async function syncStudentEvaluationToCloud(
  _appEval: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  return { success: true }
}

export async function loadDashboardOverview(campus?: string): Promise<{
  studentCount: number
  staffCount: number
  todayAttendance: { total: number; present: number; rate: string }
}> {
  const students = (Taro.getStorageSync(STORAGE_KEYS.STUDENTS) || []) as any[]
  const staff = (Taro.getStorageSync(STORAGE_KEYS.STAFF) || []) as any[]
  const today = new Date().toISOString().split('T')[0]
  const attendance = Taro.getStorageSync(`kt_attendance_${today}`) || {}
  const present = Object.values(attendance).filter((r: any) => r.status === 'present').length
  const total = Object.keys(attendance).length

  return {
    studentCount: students.length,
    staffCount: staff.length,
    todayAttendance: {
      total,
      present,
      rate: total > 0 ? `${Math.round((present / total) * 100)}%` : '0%'
    }
  }
}

export async function loadPaymentsFromBackend(_params?: {
  studentId?: string
  className?: string
  campus?: string
  startDate?: string
  endDate?: string
}): Promise<any[]> {
  return (Taro.getStorageSync(STORAGE_KEYS.PAYMENTS) || []) as any[]
}

export async function savePaymentToBackend(payment: any): Promise<{ success: boolean; error?: string }> {
  const payments = (Taro.getStorageSync(STORAGE_KEYS.PAYMENTS) || []) as any[]
  const next = [payment, ...payments.filter(item => item.id !== payment.id)]
  Taro.setStorageSync(STORAGE_KEYS.PAYMENTS, next)
  return { success: true }
}

export async function loadMealPlansFromBackend(campus?: string): Promise<any[]> {
  try {
    const token = Taro.getStorageSync(AUTH_TOKEN_KEY) || ''
    if (token && !isLocalTestToken(token)) {
      const data = await fetchMealsFromQideApi(campus)
      if (data && data.length > 0) {
        Taro.setStorageSync(STORAGE_KEYS.MEAL_PLANS, data)
        Taro.setStorageSync(STORAGE_KEYS.KITCHEN_HISTORY, data)
        return data
      }
    }
  } catch (err) {
    console.warn('[dataService] qide-api 食谱加载失败，尝试 OSS 回退:', err)
  }

  try {
    const ossData = await downloadFromAliyun<any>(STORAGE_KEYS.MEAL_PLANS)
    if (ossData && ossData.length > 0) {
      Taro.setStorageSync(STORAGE_KEYS.MEAL_PLANS, ossData)
      Taro.setStorageSync(STORAGE_KEYS.KITCHEN_HISTORY, ossData)
      return ossData
    }
  } catch (err) {
    console.warn('[dataService] OSS 食谱加载失败，使用本地缓存:', err)
  }

  return (Taro.getStorageSync(STORAGE_KEYS.MEAL_PLANS) || Taro.getStorageSync(STORAGE_KEYS.KITCHEN_HISTORY) || []) as any[]
}

export async function saveMealPlanToBackend(record: any): Promise<{ success: boolean; error?: string }> {
  const localHistory = (Taro.getStorageSync(STORAGE_KEYS.MEAL_PLANS) || []) as any[]
  const next = localHistory.some(item => item.id === record.id)
    ? localHistory.map(item => item.id === record.id ? record : item)
    : [record, ...localHistory]
  Taro.setStorageSync(STORAGE_KEYS.MEAL_PLANS, next)
  Taro.setStorageSync(STORAGE_KEYS.KITCHEN_HISTORY, next)

  try {
    const weekStart = record.weekRange?.split('~')[0]?.trim() || record.weekStart || ''
    const campus = record.grade || ''
    const mealPayload = {
      weekStart,
      campus,
      days: record.days,
      headcount: record.headcount,
      status: record.status,
      nutritionSummary: record.nutritionSummary,
      id: record.id,
    }
    const result = await saveMealToQideApi(mealPayload)
    if (result.success) {
      return { success: true }
    }
    return { success: true, error: result.error || '已保存本地，后端同步失败' }
  } catch (err: any) {
    return { success: true, error: '已保存本地，后端同步失败' }
  }
}

/** 检测云端连通性 */
export async function checkCloudConnectivity(): Promise<{
  available: boolean
  source: string
  latency?: number
  error?: string
}> {
  // 1. qide-api
  if (hasBackendAuth()) {
    try {
      const start = Date.now()
      await fetchEduBootstrapToStorage(getBackendToken())
      return { available: true, source: 'qide-api', latency: Date.now() - start }
    } catch {
      // fall through
    }
  }

  // 2. 阿里云 OSS
  try {
    const health = await checkAliyunHealth()
    return {
      available: health.isHealthy,
      source: 'aliyun-oss',
      latency: health.latency,
      error: health.error,
    }
  } catch {
    return { available: false, source: 'none', error: '所有数据源均不可用' }
  }
}

// 保留旧导出名兼容
export const isSupabaseConfigured = false

// 保留旧函数签名兼容
export async function uploadAllToCloud(
  _onProgress?: (current: number, total: number, key: string) => void
): Promise<{ success: boolean; results: Record<string, { count: number; error?: string }> }> {
  return { success: false, results: { info: { count: 0, error: '云端上传已停用，请使用网站管理数据' } } }
}

export async function downloadAllFromCloud(
  campus?: string,
  onProgress?: (current: number, total: number, key: string) => void
): Promise<{ success: boolean; results: Record<string, { count: number; error?: string }> }> {
  const result = await syncAllFromCloud(campus, onProgress)
  return {
    success: result.success,
    results: {
      [STORAGE_KEYS.STUDENTS]: { count: result.students, error: result.error },
      [STORAGE_KEYS.STAFF]: { count: result.staff, error: result.error },
    }
  }
}
