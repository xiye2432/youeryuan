/**
 * 云端数据同步服务
 * 将小程序本地数据与 Supabase 云端同步
 */

import Taro from '@tarojs/taro'
import { supabase, isSupabaseConfigured } from './supabaseClient'

// 本地存储键与数据库表的映射
const TABLE_MAPPING: Record<string, string> = {
  'kt_students': 'students',
  'kt_staff': 'staff',
  'kt_payments': 'fee_payments',
  'kt_authorized_phones': 'authorized_phones',
  'kt_all_users': 'users',
}

// 字段映射：将 camelCase 转换为 snake_case
function toSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase)
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      acc[snakeKey] = toSnakeCase(obj[key])
      return acc
    }, {} as any)
  }
  return obj
}

// 字段映射：将 snake_case 转换为 camelCase
function toCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase)
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      acc[camelKey] = toCamelCase(obj[key])
      return acc
    }, {} as any)
  }
  return obj
}

/**
 * 同步状态接口
 */
export interface SyncStatus {
  lastSyncTime: string | null
  isOnline: boolean
  isSyncing: boolean
}

// 同步状态
let syncStatus: SyncStatus = {
  lastSyncTime: Taro.getStorageSync('kt_last_sync_time') || null,
  isOnline: true,
  isSyncing: false
}

/**
 * 获取同步状态
 */
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus }
}

/**
 * 检查云端服务是否可用
 */
export async function checkCloudHealth(): Promise<{
  isHealthy: boolean
  latency?: number
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { isHealthy: false, error: '云端服务未配置' }
  }

  const startTime = Date.now()

  try {
    const { error } = await supabase.select('campuses', { limit: 1 })

    if (error) {
      return { isHealthy: false, error: error.message }
    }

    const latency = Date.now() - startTime
    syncStatus.isOnline = true
    return { isHealthy: true, latency }
  } catch (err: any) {
    syncStatus.isOnline = false
    return { isHealthy: false, error: err.message || '连接失败' }
  }
}

/**
 * 从云端下载学生数据
 */
export async function downloadStudents(campus?: string): Promise<{
  success: boolean
  data?: any[]
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: '云端服务未配置' }
  }

  try {
    const options: any = {}
    if (campus) {
      options.eq = { campus }
    }

    const { data, error } = await supabase.select('students', options)

    if (error) {
      return { success: false, error: error.message }
    }

    const localData = toCamelCase(data || [])
    
    // 保存到本地
    Taro.setStorageSync('kt_students', localData)
    
    return { success: true, data: localData }
  } catch (err: any) {
    return { success: false, error: err.message || '下载失败' }
  }
}

/**
 * 上传学生数据到云端
 */
export async function uploadStudent(student: any): Promise<{
  success: boolean
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: '云端服务未配置' }
  }

  try {
    const cloudData = toSnakeCase({
      ...student,
      updated_at: new Date().toISOString()
    })

    const { error } = await supabase.upsert('students', cloudData, 'id')

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || '上传失败' }
  }
}

/**
 * 从云端下载教职工数据
 */
export async function downloadStaff(campus?: string): Promise<{
  success: boolean
  data?: any[]
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: '云端服务未配置' }
  }

  try {
    const options: any = {}
    if (campus) {
      options.eq = { campus }
    }

    const { data, error } = await supabase.select('staff', options)

    if (error) {
      return { success: false, error: error.message }
    }

    const localData = toCamelCase(data || [])
    Taro.setStorageSync('kt_staff', localData)
    
    return { success: true, data: localData }
  } catch (err: any) {
    return { success: false, error: err.message || '下载失败' }
  }
}

/**
 * 上传教职工数据到云端
 */
export async function uploadStaff(staff: any): Promise<{
  success: boolean
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: '云端服务未配置' }
  }

  try {
    const cloudData = toSnakeCase({
      ...staff,
      updated_at: new Date().toISOString()
    })

    const { error } = await supabase.upsert('staff', cloudData, 'id')

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || '上传失败' }
  }
}

/**
 * 从云端下载缴费记录
 */
export async function downloadPayments(campus?: string): Promise<{
  success: boolean
  data?: any[]
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: '云端服务未配置' }
  }

  try {
    const options: any = {
      order: { column: 'created_at', ascending: false }
    }
    if (campus) {
      options.eq = { campus }
    }

    const { data, error } = await supabase.select('fee_payments', options)

    if (error) {
      return { success: false, error: error.message }
    }

    const localData = toCamelCase(data || [])
    Taro.setStorageSync('kt_payments', localData)
    
    return { success: true, data: localData }
  } catch (err: any) {
    return { success: false, error: err.message || '下载失败' }
  }
}

/**
 * 上传缴费记录到云端
 */
export async function uploadPayment(payment: any): Promise<{
  success: boolean
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: '云端服务未配置' }
  }

  try {
    const cloudData = toSnakeCase({
      ...payment,
      created_at: payment.createdAt || new Date().toISOString()
    })

    const { error } = await supabase.upsert('fee_payments', cloudData, 'id')

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || '上传失败' }
  }
}

/**
 * 从云端下载考勤记录
 */
export async function downloadAttendance(date: string, campus?: string): Promise<{
  success: boolean
  data?: Record<string, any>
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: '云端服务未配置' }
  }

  try {
    const options: any = {
      eq: { date }
    }
    if (campus) {
      options.eq.campus = campus
    }

    const { data, error } = await supabase.select('attendance_records', options)

    if (error) {
      return { success: false, error: error.message }
    }

    // 转换为按学生ID索引的对象
    const attendanceMap: Record<string, any> = {}
    const localData = toCamelCase(data || [])
    localData.forEach((record: any) => {
      attendanceMap[record.studentId] = record
    })

    Taro.setStorageSync(`kt_attendance_${date}`, attendanceMap)
    
    return { success: true, data: attendanceMap }
  } catch (err: any) {
    return { success: false, error: err.message || '下载失败' }
  }
}

/**
 * 上传考勤记录到云端
 */
export async function uploadAttendance(date: string, studentId: string, record: any): Promise<{
  success: boolean
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: '云端服务未配置' }
  }

  try {
    const cloudData = toSnakeCase({
      id: `${date}_${studentId}`,
      date,
      student_id: studentId,
      ...record,
      updated_at: new Date().toISOString()
    })

    const { error } = await supabase.upsert('attendance_records', cloudData, 'id')

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || '上传失败' }
  }
}

/**
 * 从云端下载食谱数据
 */
export async function downloadMealPlans(): Promise<{
  success: boolean
  data?: any[]
  error?: string
}> {
  if (!isSupabaseConfigured) {
    return { success: false, error: '云端服务未配置' }
  }

  try {
    const { data, error } = await supabase.select('meal_plans', {
      order: { column: 'created_at', ascending: false },
      limit: 10
    })

    if (error) {
      return { success: false, error: error.message }
    }

    const localData = toCamelCase(data || [])
    Taro.setStorageSync('kt_kitchen_history_v2', localData)
    
    return { success: true, data: localData }
  } catch (err: any) {
    return { success: false, error: err.message || '下载失败' }
  }
}

/**
 * 全量同步所有数据
 */
export async function syncAllData(
  campus?: string,
  onProgress?: (current: number, total: number, key: string) => void
): Promise<{
  success: boolean
  results: Record<string, { success: boolean; count?: number; error?: string }>
}> {
  if (!isSupabaseConfigured) {
    return { 
      success: false, 
      results: { error: { success: false, error: '云端服务未配置' } } 
    }
  }

  syncStatus.isSyncing = true
  const results: Record<string, any> = {}
  const tasks = [
    { key: 'students', fn: () => downloadStudents(campus) },
    { key: 'staff', fn: () => downloadStaff(campus) },
    { key: 'payments', fn: () => downloadPayments(campus) },
    { key: 'mealPlans', fn: () => downloadMealPlans() },
  ]

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    onProgress?.(i + 1, tasks.length, task.key)

    const result = await task.fn()
    results[task.key] = {
      success: result.success,
      count: result.data?.length || 0,
      error: result.error
    }

    // 添加小延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  syncStatus.isSyncing = false
  syncStatus.lastSyncTime = new Date().toISOString()
  Taro.setStorageSync('kt_last_sync_time', syncStatus.lastSyncTime)

  const allSuccess = Object.values(results).every(r => r.success)
  return { success: allSuccess, results }
}

/**
 * 获取云端配置状态
 */
export function getCloudConfigStatus(): {
  isConfigured: boolean
  message: string
} {
  if (!isSupabaseConfigured) {
    return {
      isConfigured: false,
      message: '请在 supabaseClient.ts 中配置 Supabase URL 和 Key'
    }
  }
  return {
    isConfigured: true,
    message: '云端服务已配置'
  }
}

export { isSupabaseConfigured }
