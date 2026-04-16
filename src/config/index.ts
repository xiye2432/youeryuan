/**
 * 小程序配置文件
 * 请将下面的占位符替换为您的实际值
 */

function getEnvVar(key: string, fallback = ''): string {
  try {
    const env = typeof process !== 'undefined' && process?.env ? process.env : undefined
    const value = env?.[key]
    return typeof value === 'string' && value ? value : fallback
  } catch {
    return fallback
  }
}

// ===== PostgREST（历史文件名常称 Supabase）=====
// 金星幼儿园线上一律走腾讯微信云托管 qide-api；此处留空即关闭 REST 同步分支。
// 若将来需要 PostgREST，再填入 url 与 anonKey，并自行评估 RLS 与密钥管理。

export const SUPABASE_CONFIG = {
  url: '',
  anonKey: ''
}

// ===== 园所配置 =====
export const CAMPUS_CONFIG = {
  // 默认园所名称
  defaultCampus: '金星幼儿园',
  
  // 支持的班级列表
  classes: ['托班', '小一班', '小二班', '中一班', '中二班', '大一班', '大二班']
}

// ===== qide-api 云托管配置 =====
export const QIDE_API_CONFIG = {
  enabled: true,
  brandId: 2,
  baseUrl: getEnvVar('TARO_APP_API_BASE', 'https://qide-api-226038-8-1404676026.sh.run.tcloudbase.com'),
  timeout: 30000,
}

// ===== 检查配置是否有效 =====
export const isConfigured = () => {
  return (
    SUPABASE_CONFIG.url !== '' &&
    SUPABASE_CONFIG.anonKey !== '' &&
    !SUPABASE_CONFIG.url.includes('your-project-id')
  )
}
