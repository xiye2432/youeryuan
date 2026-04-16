/**
 * Supabase 客户端配置
 * 小程序端与网站共用同一个数据库
 */

import { SUPABASE_CONFIG, isConfigured } from '../config'

// 从配置文件读取
const SUPABASE_URL = SUPABASE_CONFIG.url
const SUPABASE_ANON_KEY = SUPABASE_CONFIG.anonKey

// 检查是否已配置
export const isSupabaseConfigured = isConfigured()

/**
 * 小程序环境下的 Supabase 请求封装
 * 使用 Taro.request 代替 fetch
 */
import Taro from '@tarojs/taro'

interface SupabaseResponse<T> {
  data: T | null
  error: { message: string; code?: string } | null
}

class SupabaseClient {
  private url: string
  private key: string

  constructor(url: string, key: string) {
    this.url = url
    this.key = key
  }

  private getHeaders() {
    return {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  }

  /**
   * 查询数据
   */
  async select<T>(table: string, options?: {
    columns?: string
    eq?: Record<string, any>
    order?: { column: string; ascending?: boolean }
    limit?: number
  }): Promise<SupabaseResponse<T[]>> {
    try {
      let url = `${this.url}/rest/v1/${table}`
      const params: string[] = []

      if (options?.columns) {
        params.push(`select=${options.columns}`)
      } else {
        params.push('select=*')
      }

      if (options?.eq) {
        Object.entries(options.eq).forEach(([key, value]) => {
          params.push(`${key}=eq.${value}`)
        })
      }

      if (options?.order) {
        const dir = options.order.ascending === false ? '.desc' : '.asc'
        params.push(`order=${options.order.column}${dir}`)
      }

      if (options?.limit) {
        params.push(`limit=${options.limit}`)
      }

      if (params.length > 0) {
        url += '?' + params.join('&')
      }

      const response = await Taro.request({
        url,
        method: 'GET',
        header: this.getHeaders()
      })

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { data: response.data as T[], error: null }
      } else {
        return { 
          data: null, 
          error: { message: response.data?.message || '请求失败', code: String(response.statusCode) } 
        }
      }
    } catch (err: any) {
      return { data: null, error: { message: err.message || '网络错误' } }
    }
  }

  /**
   * 插入数据
   */
  async insert<T>(table: string, data: Partial<T> | Partial<T>[]): Promise<SupabaseResponse<T[]>> {
    try {
      const url = `${this.url}/rest/v1/${table}`
      
      const response = await Taro.request({
        url,
        method: 'POST',
        header: this.getHeaders(),
        data: Array.isArray(data) ? data : [data]
      })

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { data: response.data as T[], error: null }
      } else {
        return { 
          data: null, 
          error: { message: response.data?.message || '插入失败', code: String(response.statusCode) } 
        }
      }
    } catch (err: any) {
      return { data: null, error: { message: err.message || '网络错误' } }
    }
  }

  /**
   * 更新数据
   */
  async update<T>(table: string, data: Partial<T>, eq: Record<string, any>): Promise<SupabaseResponse<T[]>> {
    try {
      let url = `${this.url}/rest/v1/${table}`
      const params = Object.entries(eq).map(([key, value]) => `${key}=eq.${value}`)
      url += '?' + params.join('&')

      const response = await Taro.request({
        url,
        method: 'PATCH',
        header: this.getHeaders(),
        data
      })

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { data: response.data as T[], error: null }
      } else {
        return { 
          data: null, 
          error: { message: response.data?.message || '更新失败', code: String(response.statusCode) } 
        }
      }
    } catch (err: any) {
      return { data: null, error: { message: err.message || '网络错误' } }
    }
  }

  /**
   * 删除数据
   */
  async delete<T>(table: string, eq: Record<string, any>): Promise<SupabaseResponse<T[]>> {
    try {
      let url = `${this.url}/rest/v1/${table}`
      const params = Object.entries(eq).map(([key, value]) => `${key}=eq.${value}`)
      url += '?' + params.join('&')

      const response = await Taro.request({
        url,
        method: 'DELETE',
        header: this.getHeaders()
      })

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { data: response.data as T[], error: null }
      } else {
        return { 
          data: null, 
          error: { message: response.data?.message || '删除失败', code: String(response.statusCode) } 
        }
      }
    } catch (err: any) {
      return { data: null, error: { message: err.message || '网络错误' } }
    }
  }

  /**
   * Upsert (插入或更新)
   */
  async upsert<T>(table: string, data: Partial<T> | Partial<T>[], onConflict?: string): Promise<SupabaseResponse<T[]>> {
    try {
      let url = `${this.url}/rest/v1/${table}`
      if (onConflict) {
        url += `?on_conflict=${onConflict}`
      }

      const headers = {
        ...this.getHeaders(),
        'Prefer': 'resolution=merge-duplicates,return=representation'
      }

      const response = await Taro.request({
        url,
        method: 'POST',
        header: headers,
        data: Array.isArray(data) ? data : [data]
      })

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { data: response.data as T[], error: null }
      } else {
        return { 
          data: null, 
          error: { message: response.data?.message || 'Upsert失败', code: String(response.statusCode) } 
        }
      }
    } catch (err: any) {
      return { data: null, error: { message: err.message || '网络错误' } }
    }
  }
}

// 导出单例
export const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY)
