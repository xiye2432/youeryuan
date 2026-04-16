import Taro from '@tarojs/taro'
import { QIDE_API_CONFIG } from '../config'

export const AUTH_TOKEN_KEY = 'kt_auth_token'
const STUDENTS_KEY = 'kt_students'
const STAFF_KEY = 'kt_staff'
const CLASSROOMS_KEY = 'kt_classrooms'
const LOCAL_TEST_USERS_KEY = 'kt_test_users'


class ApiError extends Error {
  statusCode: number
  payload: any

  constructor(message: string, statusCode = 500, payload?: any) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.payload = payload
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  path: string
  data?: Record<string, unknown>
  token?: string
}

function mapStaffRole(role: string | undefined | null): 'ADMIN' | 'TEACHER' | 'KITCHEN' | 'FINANCE' | 'PARENT' {
  const value = (role || '').trim()
  if (!value) return 'TEACHER'

  const upper = value.toUpperCase()
  if (upper === 'SUPER_ADMIN' || upper === 'ADMIN') return 'ADMIN'
  if (upper === 'TEACHER') return 'TEACHER'
  if (upper === 'KITCHEN') return 'KITCHEN'
  if (upper === 'FINANCE' || upper === 'FINANCE_STAFF') return 'FINANCE'
  if (upper === 'PARENT') return 'PARENT'

  if (/(园长|主任|管理|行政|总务|园区管理员|校长)/.test(value)) return 'ADMIN'
  if (/(厨房|厨|餐)/.test(value)) return 'KITCHEN'
  if (/(财务|出纳|会计|收费)/.test(value)) return 'FINANCE'
  if (/(家长)/.test(value)) return 'PARENT'
  return 'TEACHER'
}


async function request<T>({ method = 'GET', path, data, token }: RequestOptions): Promise<T> {
  const response = await Taro.request({
    url: `${QIDE_API_CONFIG.baseUrl}${path}`,
    method,
    timeout: QIDE_API_CONFIG.timeout,
    header: {
      'Content-Type': 'application/json',
      'X-Brand-ID': String(QIDE_API_CONFIG.brandId),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data,
  })

  const payload = typeof response.data === 'string'
    ? JSON.parse(response.data)
    : response.data

  if (response.statusCode >= 400 || !payload?.success) {
    throw new ApiError(payload?.message || payload?.error || `请求失败(${response.statusCode})`, response.statusCode, payload)
  }

  return payload as T
}

function normalizeAuthPayload(result: any) {
  return {
    success: true,
    data: {
      token: result?.data?.token,
      staff: result?.data?.staff || result?.data?.user,
    },
  }
}

function getLocalTestUsers(): any[] {
  const users = Taro.getStorageSync(LOCAL_TEST_USERS_KEY) || []
  return Array.isArray(users) ? users : []
}

function saveLocalTestUsers(users: any[]) {
  Taro.setStorageSync(LOCAL_TEST_USERS_KEY, users)
  Taro.setStorageSync('kt_all_users', users)
}

function createLocalToken(phone: string) {
  return `local-test-token-${phone}-${Date.now()}`
}

function localRegister(phone: string, password: string, extra?: { name?: string; role?: string; campus?: string }) {
  const users = getLocalTestUsers()
  const exists = users.find((u: any) => u.phone === phone)
  if (exists) {
    throw new Error('该手机号已注册')
  }

  const user = {
    id: `local_${Date.now()}`,
    phone,
    name: extra?.name || `测试用户${phone.slice(-4)}`,
    role: extra?.role || 'TEACHER',
    campus: extra?.campus || '总园',
    password,
    createdAt: new Date().toISOString(),
  }

  const nextUsers = [...users, user]
  saveLocalTestUsers(nextUsers)

  return {
    success: true,
    data: {
      token: createLocalToken(phone),
      staff: user,
    },
  }
}

function localPasswordLogin(phone: string, password: string) {
  const user = getLocalTestUsers().find((u: any) => u.phone === phone)
  if (!user) {
    throw new Error('该手机号未注册，请先注册')
  }
  if (user.password !== password) {
    throw new Error('手机号或密码错误')
  }

  return {
    success: true,
    data: {
      token: createLocalToken(phone),
      staff: user,
    },
  }
}


function shouldFallbackToLocalAuth(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true
  return [0, 401, 404, 405, 500, 502, 503, 504].includes(err.statusCode)
}

export function getQideAuthToken(): string {

  return Taro.getStorageSync(AUTH_TOKEN_KEY) || ''
}

export function isLocalTestToken(token?: string): boolean {
  const value = token || getQideAuthToken()
  return typeof value === 'string' && value.startsWith('local-test-token-')
}

export function hasQideAuthToken(): boolean {
  return !!getQideAuthToken()
}


export function clearQideAuthToken() {
  Taro.removeStorageSync(AUTH_TOKEN_KEY)
}

export async function sendQideVerificationCode(phone: string) {
  return request<{ success: boolean; message: string }>({
    method: 'POST',
    path: '/api/auth/send-code',
    data: {
      phone,
      type: 'verification',
    }
  })
}

export async function staffPasswordLogin(phone: string, password: string) {
  try {
    return await request<{ success: boolean; data: { token: string; staff: any } }>({
      method: 'POST',
      path: '/api/auth/staff/login',
      data: { phone, password }
    })
  } catch (err: any) {
    if (shouldFallbackToLocalAuth(err)) {
      try {
        const result = await request<{ success: boolean; data: { token: string; user: any } }>({
          method: 'POST',
          path: '/api/auth/login',
          data: { phone, password }
        })
        return normalizeAuthPayload(result)
      } catch (fallbackErr: any) {
        if (shouldFallbackToLocalAuth(fallbackErr)) {
          return localPasswordLogin(phone, password)
        }
        throw fallbackErr
      }
    }
    throw err
  }
}



export async function staffCodeLogin(phone: string, code: string) {
  return request<{ success: boolean; data: { token: string; staff: any } }>({
    method: 'POST',
    path: '/api/auth/staff/login-code',
    data: { phone, code }
  })
}

export async function staffRegister(
  phone: string,
  code: string,
  password: string,
  extra?: { name?: string; role?: string; campus?: string }
) {
  try {
    return await request<{ success: boolean; data: { token: string; staff: any } }>({
      method: 'POST',
      path: '/api/auth/staff/register',
      data: { phone, code, password, name: extra?.name, role: extra?.role, campus: extra?.campus }
    })
  } catch (err: any) {
    if (shouldFallbackToLocalAuth(err)) {
      try {
        const result = await request<{ success: boolean; data: { token: string; user: any } }>({
          method: 'POST',
          path: '/api/auth/register',
          data: {
            phone,
            name: extra?.name || '测试用户',
            password,
            role: extra?.role || 'TEACHER',
            campus: extra?.campus || '总园',
          }
        })
        return normalizeAuthPayload(result)
      } catch (fallbackErr: any) {
        if (shouldFallbackToLocalAuth(fallbackErr)) {
          return localRegister(phone, password, extra)
        }
        throw fallbackErr
      }
    }
    throw err
  }
}



export function toLocalUser(staff: any) {
  return {
    id: String(staff.id),
    phone: staff.phone,
    name: staff.name,
    role: mapStaffRole(staff.role),
    rawRole: staff.role,
    campus: staff.branch?.name || staff.department || staff.campus || '金星幼儿园',
    branchId: staff.branchId ?? null,
    brandId: staff.brandId ?? QIDE_API_CONFIG.brandId,
  }
}

export async function fetchEduBootstrapToStorage(token: string) {
  if (isLocalTestToken(token)) {
    throw new ApiError('测试账号不走远端 bootstrap，同步请使用 OSS 公共数据', 401)
  }

  const result = await request<{

    success: boolean
    data: {
      students: any[]
      staff: any[]
      classrooms?: any[]
      counts?: { students?: number; staff?: number; classrooms?: number }
    }
  }>({
    method: 'GET',
    path: '/api/edu-auth/staff-bootstrap',
    token,
  })

  const data = result.data || { students: [], staff: [], classrooms: [], counts: {} }
  Taro.setStorageSync(STUDENTS_KEY, data.students || [])
  Taro.setStorageSync(STAFF_KEY, data.staff || [])
  Taro.setStorageSync(CLASSROOMS_KEY, data.classrooms || [])
  Taro.setStorageSync('kt_last_sync_time', new Date().toISOString())

  return {
    success: true,
    students: data.students?.length || data.counts?.students || 0,
    staff: data.staff?.length || data.counts?.staff || 0,
    classrooms: data.classrooms?.length || data.counts?.classrooms || 0,
  }
}

export async function fetchMealsFromQideApi(campus?: string): Promise<any[]> {
  const token = getQideAuthToken()
  if (!token || isLocalTestToken(token)) {
    throw new ApiError('未登录或测试账号，无法获取食谱', 401)
  }

  const result = await request<{
    success: boolean
    data: any[]
  }>({
    method: 'GET',
    path: `/api/meals${campus ? `?campus=${encodeURIComponent(campus)}` : ''}`,
    token,
  })

  return result.data || []
}

export async function saveMealToQideApi(mealData: {
  weekStart: string
  campus: string
  days?: any[]
  headcount?: number
  status?: string
  nutritionSummary?: any
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const token = getQideAuthToken()
  if (!token || isLocalTestToken(token)) {
    return { success: false, error: '未登录或测试账号，无法保存食谱' }
  }

  try {
    const result = await request<{
      success: boolean
      data: any
    }>({
      method: 'POST',
      path: '/api/meals',
      data: mealData,
      token,
    })
    return { success: true, data: result.data }
  } catch (err: any) {
    return { success: false, error: err?.message || '保存食谱到后端失败' }
  }
}

