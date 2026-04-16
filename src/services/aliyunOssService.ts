/**
 * 阿里云 OSS 存储服务 - 小程序版（公共读模式）
 * Bucket已设置为公共读，无需签名
 */

import Taro from '@tarojs/taro'
import { fetchEduBootstrapToStorage, hasQideAuthToken, getQideAuthToken, isLocalTestToken } from './qideApi'

// 阿里云 OSS 配置
const OSS_CONFIG = {
  region: 'oss-cn-beijing',
  bucket: 'venus-data',
}

// 存储键定义（与网站保持一致）
export const STORAGE_KEYS = {
  STUDENTS: 'kt_students',
  STAFF: 'kt_staff',
  AUTHORIZED_PHONES: 'kt_authorized_phones',
  ALL_USERS: 'kt_all_users',
  FEE_PAYMENTS: 'kt_fee_payments',
  KITCHEN_HISTORY: 'kt_kitchen_history_v2',
  OPERATION_LOGS: 'kt_operation_logs',
  ANNOUNCEMENTS: 'kt_announcements',
  DOCUMENTS: 'kt_documents',
  VISITORS: 'kt_visitors',
  HEALTH_RECORDS: 'kt_health_records',
  ATTENDANCE_RECORDS: 'kt_attendance_records',
  MEAL_PLANS: 'kt_meal_plans',
}

// 检查是否已配置
export const isAliyunConfigured = true

// 获取OSS公共URL（加时间戳绕过缓存）
function getPublicUrl(storageKey: string): string {
  const timestamp = Date.now()
  return `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.region}.aliyuncs.com/jinxing-edu/${storageKey}.json?t=${timestamp}`
}

/**
 * 简单GET请求（公共读，无需签名）
 */
async function publicGet<T>(storageKey: string): Promise<{ success: boolean; data?: T[]; error?: string }> {
  const url = getPublicUrl(storageKey)
  console.log(`[AliyunOSS] 请求: ${url}`)
  
  try {
    const response = await Taro.request({
      url,
      method: 'GET',
      timeout: 120000,
    })
    
    console.log(`[AliyunOSS] 响应状态: ${response.statusCode}`)
    
    if (response.statusCode === 200) {
      let data = response.data
      
      // 如果是字符串，尝试解析JSON
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (e) {
          console.error('[AliyunOSS] JSON解析失败')
          return { success: false, error: 'JSON解析失败' }
        }
      }
      
      if (Array.isArray(data)) {
        console.log(`[AliyunOSS] ✅ 下载成功: ${storageKey} (${data.length}条)`)
        return { success: true, data }
      } else {
        console.log(`[AliyunOSS] 数据格式错误，不是数组`)
        return { success: false, error: '数据格式错误' }
      }
    } else if (response.statusCode === 404) {
      console.log(`[AliyunOSS] 文件不存在: ${storageKey}`)
      return { success: false, error: '文件不存在' }
    } else {
      console.error(`[AliyunOSS] HTTP ${response.statusCode}`)
      return { success: false, error: `HTTP ${response.statusCode}` }
    }
  } catch (err: any) {
    console.error(`[AliyunOSS] 请求异常:`, err.errMsg || err.message || err)
    return { success: false, error: err.errMsg || err.message || '网络错误' }
  }
}

/**
 * OSS 公共读回退同步
 */
async function syncFromPublicOss(
  onProgress?: (current: number, total: number, key: string) => void
): Promise<{ success: boolean; results: Record<string, any> }> {
  console.log('[AliyunOSS] 🚀 开始下载数据（公共读模式）...')

  const results: Record<string, any> = {}
  const keysToSync = [
    STORAGE_KEYS.ALL_USERS,
    STORAGE_KEYS.AUTHORIZED_PHONES,
    STORAGE_KEYS.STUDENTS,
    STORAGE_KEYS.STAFF,
    STORAGE_KEYS.MEAL_PLANS,
  ]

  for (let i = 0; i < keysToSync.length; i++) {
    const key = keysToSync[i]
    onProgress?.(i + 1, keysToSync.length, key)

    const result = await publicGet<any>(key)

    if (result.success && result.data) {
      Taro.setStorageSync(key, result.data)
      results[key] = { success: true, count: result.data.length }
      console.log(`[AliyunOSS] ✅ ${key}: ${result.data.length}条`)
    } else {
      results[key] = { success: false, error: result.error }
      console.log(`[AliyunOSS] ⚠️ ${key}: ${result.error || '无数据'}`)
    }
  }

  Taro.setStorageSync('kt_last_sync_time', new Date().toISOString())
  console.log('[AliyunOSS] ✅ 初始化完成')
  return {
    success: Object.values(results).some((r: any) => r.success),
    results,
  }
}

/**
 * 下载数据（公共读）
 */
export async function downloadFromAliyun<T>(storageKey: string): Promise<T[]> {
  const result = await publicGet<T>(storageKey)
  return result.data || []
}

/**
 * 只下载学生数据（快速同步）
 */
export async function downloadStudentsOnly(): Promise<{ success: boolean; count: number; error?: string }> {
  const token = getQideAuthToken()
  if (hasQideAuthToken() && !isLocalTestToken(token)) {
    try {
      const result = await fetchEduBootstrapToStorage(token)
      return { success: true, count: result.students }
    } catch (error: any) {
      console.warn('[QideAPI] 学生同步失败，回退 OSS:', error)
    }
  }

  console.log('[AliyunOSS] 📥 快速下载学生数据...')
  
  const result = await publicGet<any>(STORAGE_KEYS.STUDENTS)
  
  if (result.success && result.data && result.data.length > 0) {
    Taro.setStorageSync(STORAGE_KEYS.STUDENTS, result.data)
    return { success: true, count: result.data.length }
  } else if (result.success) {
    return { success: true, count: 0, error: '云端文件为空' }
  } else {
    return { success: false, count: 0, error: result.error }
  }
}

/**
 * 从阿里云初始化数据（下载所有核心数据）
 */
export async function initializeFromAliyun(
  onProgress?: (current: number, total: number, key: string) => void
): Promise<{ success: boolean; results: Record<string, any> }> {
  const token = getQideAuthToken()
  if (hasQideAuthToken() && !isLocalTestToken(token)) {
    try {
      onProgress?.(1, 1, 'qide-api')
      const result = await fetchEduBootstrapToStorage(token)
      return {
        success: true,
        results: {
          [STORAGE_KEYS.STUDENTS]: { success: true, count: result.students },
          [STORAGE_KEYS.STAFF]: { success: true, count: result.staff },
          kt_classrooms: { success: true, count: result.classrooms },
        }
      }
    } catch (error: any) {
      console.warn('[QideAPI] 初始化失败，回退 OSS:', error)
    }
  }

  return syncFromPublicOss(onProgress)
}

/**
 * 下载所有数据（学生+教职工）
 */
export async function downloadAllData(): Promise<{ success: boolean; students: number; staff: number; error?: string }> {
  const token = getQideAuthToken()
  if (hasQideAuthToken() && !isLocalTestToken(token)) {
    try {
      const result = await fetchEduBootstrapToStorage(token)
      return {
        success: true,
        students: result.students,
        staff: result.staff,
      }
    } catch (error: any) {
      console.warn('[QideAPI] 全量同步失败，回退 OSS:', error)
    }
  }

  console.log('[AliyunOSS] 📥 下载所有数据...')
  
  let students = 0
  let staff = 0
  
  // 下载学生
  const studentResult = await publicGet<any>(STORAGE_KEYS.STUDENTS)
  if (studentResult.success && studentResult.data) {
    Taro.setStorageSync(STORAGE_KEYS.STUDENTS, studentResult.data)
    students = studentResult.data.length
  }
  
  // 下载教职工
  const staffResult = await publicGet<any>(STORAGE_KEYS.STAFF)
  if (staffResult.success && staffResult.data) {
    Taro.setStorageSync(STORAGE_KEYS.STAFF, staffResult.data)
    staff = staffResult.data.length
  }
  
  Taro.setStorageSync('kt_last_sync_time', new Date().toISOString())
  
  return {
    success: students > 0 || staff > 0,
    students,
    staff,
    error: (students === 0 && staff === 0) ? '云端无数据' : undefined
  }
}

/**
 * 上传到阿里云（小程序暂不支持，请使用网站上传）
 */
export async function uploadToAliyun(storageKey: string, data: any[]): Promise<boolean> {
  console.log('[AliyunOSS] ⚠️ 小程序暂不支持上传，请使用网站')
  Taro.showToast({ title: '请在网站上传数据', icon: 'none' })
  return false
}

export async function uploadAllToAliyun(
  _onProgress?: (current: number, total: number, key: string) => void
): Promise<{ success: boolean; results: Record<string, any> }> {
  console.log('[AliyunOSS] ⚠️ 小程序暂不支持上传，请使用网站')
  Taro.showToast({ title: '请在网站上传数据', icon: 'none' })
  return { success: false, results: {} }
}

/**
 * 检查阿里云连接状态
 */
export async function checkAliyunHealth(): Promise<{ 
  isHealthy: boolean
  latency?: number
  error?: string 
}> {
  const startTime = Date.now()
  const url = getPublicUrl(STORAGE_KEYS.STUDENTS)
  
  try {
    const response = await Taro.request({
      url,
      method: 'HEAD', // 只检查是否能连接
      timeout: 10000,
    })
    
    const latency = Date.now() - startTime
    return { 
      isHealthy: response.statusCode === 200 || response.statusCode === 404,
      latency 
    }
  } catch (error: any) {
    return { isHealthy: false, error: error.message }
  }
}

/**
 * 获取同步状态
 */
export function getSyncStatus() {
  return {
    enabled: true,
    provider: '阿里云 OSS (公共读)',
    region: OSS_CONFIG.region,
    bucket: OSS_CONFIG.bucket,
    lastSyncTime: Taro.getStorageSync('kt_last_sync_time') || null
  }
}
