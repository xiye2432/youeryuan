import { useState, useEffect } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { syncAllFromCloud } from '../../services/dataService'
import { sendVerificationCode as sendLocalVerificationCode, isRealSmsEnabled } from '../../services/smsService'
import {
  AUTH_TOKEN_KEY,
  sendQideVerificationCode,
  staffCodeLogin,
  staffPasswordLogin,
  staffRegister,
  toLocalUser,
} from '../../services/qideApi'
import { safeGo } from '../../utils/nav'
import './index.scss'

// 安全的toast显示函数
const safeToast = (title: string | undefined | null, icon: 'success' | 'none' = 'none') => {
  Taro.showToast({ 
    title: title || '操作完成', 
    icon 
  })
}

interface User {
  id: string
  phone: string
  name: string
  role: string
  campus?: string
  passwordHash?: string
  createdAt?: string
}

// 可选角色
const AVAILABLE_ROLES = [
  { role: 'ADMIN', label: '园区管理员', icon: '👔', desc: '管理本园区' },
  { role: 'TEACHER', label: '教师', icon: '👩‍🏫', desc: '考勤、课程' },
  { role: 'KITCHEN', label: '厨房人员', icon: '🍳', desc: '食谱管理' },
  { role: 'FINANCE', label: '财务人员', icon: '💰', desc: '收费管理' },
]

// 默认园区
const DEFAULT_CAMPUSES = ['总园', '南江', '高新', '新市花园', '创越']

// 测试模式：注册时不显示验证码，提交时自动带默认验证码
const TEST_REGISTER_NO_CODE = true
const TEST_REGISTER_CODE = '000000'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loginType, setLoginType] = useState<'password' | 'sms'>('password')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // 注册时的角色和园区
  const [selectedRole, setSelectedRole] = useState('TEACHER')
  const [selectedCampus, setSelectedCampus] = useState('总园')
  
  // 验证码相关
  const [smsCode, setSmsCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [devCode, setDevCode] = useState('') // 开发模式下显示的验证码

  useEffect(() => {
    const user = Taro.getStorageSync('kt_current_user')
    if (user) {
      safeGo('/pages/index/index')
    }
  }, [])

  useEffect(() => {
    // 登录页不需要预加载，登录成功后再同步
  }, [])

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  // 登录成功后自动同步数据
  const syncAfterLogin = async () => {
    Taro.showLoading({ title: '同步数据中...' })
    try {
      const currentUser = Taro.getStorageSync('kt_current_user') || {}
      const campus = currentUser.campus
      const result = await syncAllFromCloud(campus)
      Taro.hideLoading()
      console.log(`[Login] 同步完成: 学生${result.students}条，教职工${result.staff}条 (${result.source})`)
    } catch (err) {
      Taro.hideLoading()
      console.error('[Login] 同步失败:', err)
    }
  }

  // 登录成功处理
  const onLoginSuccess = async (user: User, token?: string) => {
    if (token) {
      Taro.setStorageSync(AUTH_TOKEN_KEY, token)
    }
    Taro.setStorageSync('kt_current_user', user)
    
    // 先同步数据
    await syncAfterLogin()
    
    safeToast('登录成功', 'success')
    setTimeout(() => {
      const role = user.role || 'TEACHER'
      if (role === 'KITCHEN') {
        Taro.redirectTo({ url: '/pages/kitchen/index' })
      } else if (role === 'FINANCE') {
        Taro.redirectTo({ url: '/pages/finance/index' })
      } else {
        safeGo('/pages/index/index')
      }
    }, 1000)
  }

  // 发送验证码
  const handleSendCode = async () => {
    if (!phone.trim() || phone.length !== 11) {
      safeToast('请输入有效手机号')
      return
    }

    if (countdown > 0) return

    Taro.showLoading({ title: '发送中...' })
    try {
      let result
      try {
        result = await sendQideVerificationCode(phone)
      } catch (error) {
        result = await sendLocalVerificationCode(phone)
      }
      Taro.hideLoading()

      if (result && result.success) {
        setCountdown(60)
        // 开发模式下显示验证码
        if (result.code) {
          setDevCode(result.code)
          Taro.showModal({
            title: '开发模式',
            content: `验证码: ${result.code}\n\n（正式环境会发送短信）`,
            showCancel: false
          })
        } else {
          safeToast(result.message || '验证码已发送', 'success')
        }
      } else {
        safeToast(result?.message || '发送失败')
      }
    } catch (err) {
      Taro.hideLoading()
      console.error('[SMS] 发送异常:', err)
      safeToast('发送失败，请重试')
    }
  }

  // 密码登录
  const handlePasswordLogin = async () => {
    if (!phone.trim()) {
      safeToast('请输入手机号')
      return
    }
    if (!password.trim()) {
      safeToast('请输入密码')
      return
    }

    setLoading(true)

    try {
      const result = await staffPasswordLogin(phone, password)
      await onLoginSuccess(toLocalUser(result.data.staff), result.data.token)
    } catch (err: any) {
      safeToast(err?.message || '登录失败')
    }
    setLoading(false)
  }

  // 验证码登录
  const handleSmsLogin = async () => {
    if (!phone.trim() || phone.length !== 11) {
      safeToast('请输入有效手机号')
      return
    }
    if (!smsCode.trim()) {
      safeToast('请输入验证码')
      return
    }

    setLoading(true)

    try {
      const result = await staffCodeLogin(phone, smsCode)
      await onLoginSuccess(toLocalUser(result.data.staff), result.data.token)
    } catch (err: any) {
      console.error('[SMS] 验证异常:', err)
      safeToast(err?.message || '验证失败，请重试')
    }
    setLoading(false)
  }

  // 登录处理
  const handleLogin = async () => {
    if (loginType === 'password') {
      await handlePasswordLogin()
    } else {
      await handleSmsLogin()
    }
  }

  const handleRegister = () => {
    if (!phone.trim() || phone.length !== 11) {
      safeToast('请输入有效手机号')
      return
    }
    if (!name.trim()) {
      safeToast('请输入姓名')
      return
    }
    if (password.length < 6) {
      safeToast('密码至少6位')
      return
    }
    if (password !== confirmPassword) {
      safeToast('两次密码不一致')
      return
    }
    if (!TEST_REGISTER_NO_CODE && !smsCode.trim()) {
      safeToast('请输入验证码')
      return
    }

    setLoading(true)

    const registerCode = TEST_REGISTER_NO_CODE ? TEST_REGISTER_CODE : smsCode

    staffRegister(phone, registerCode, password, {
      name,
      role: selectedRole,
      campus: selectedCampus,
    })
      .then(async (result) => {
        await onLoginSuccess(toLocalUser(result.data.staff), result.data.token)
      })
      .catch((err: any) => {
        safeToast(err?.message || '注册失败')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  return (
    <View className='login-page'>
      <View className='form-card'>
        {/* 头部 - 深绿色 */}
        <View className='header-bg'>
          <View className='logo'>
            <Text className='logo-icon'>🌿</Text>
            <Text className='logo-text'>金星幼儿园</Text>
          </View>
          <Text className='subtitle'>自然 · 养育 · 成长</Text>
        </View>

        {/* 切换标签 */}
        <View className='mode-tabs'>
          <View 
            className={`tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            <Text>登录</Text>
          </View>
          <View 
            className={`tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            <Text>注册</Text>
          </View>
        </View>

        {/* 登录方式切换（仅登录模式） */}
        {mode === 'login' && (
          <View className='login-type-tabs'>
            <View 
              className={`type-tab ${loginType === 'password' ? 'active' : ''}`}
              onClick={() => setLoginType('password')}
            >
              <Text>密码登录</Text>
            </View>
            <View 
              className={`type-tab ${loginType === 'sms' ? 'active' : ''}`}
              onClick={() => setLoginType('sms')}
            >
              <Text>验证码登录</Text>
            </View>
          </View>
        )}

        {/* 表单 */}
        <View className='form'>
          {mode === 'register' && (
            <>
              <View className='form-item'>
                <Text className='label'>您的姓名</Text>
                <Input
                  className='input'
                  placeholder='请输入姓名'
                  value={name}
                  onInput={(e) => setName(e.detail.value)}
                />
              </View>
              
              {/* 角色选择 */}
              <View className='form-item'>
                <Text className='label'>选择角色</Text>
                <View className='role-grid'>
                  {AVAILABLE_ROLES.map(r => (
                    <View 
                      key={r.role}
                      className={`role-item ${selectedRole === r.role ? 'active' : ''}`}
                      onClick={() => setSelectedRole(r.role)}
                    >
                      <Text className='role-icon'>{r.icon}</Text>
                      <Text className='role-label'>{r.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              
              {/* 园区选择 */}
              <View className='form-item'>
                <Text className='label'>所属园区</Text>
                <View className='campus-list'>
                  {DEFAULT_CAMPUSES.map(c => (
                    <View 
                      key={c}
                      className={`campus-item ${selectedCampus === c ? 'active' : ''}`}
                      onClick={() => setSelectedCampus(c)}
                    >
                      <Text>{c}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

          <View className='form-item'>
            <Text className='label'>手机号</Text>
            <Input
              className='input'
              type={mode === 'login' && loginType === 'password' ? 'text' : 'number'}
              placeholder={mode === 'login' && loginType === 'password' ? '请输入手机号' : '请输入11位手机号'}
              value={phone}
              onInput={(e) => setPhone(e.detail.value)}
              maxlength={mode === 'login' && loginType === 'password' ? 20 : 11}
            />
          </View>

          {/* 密码输入 */}
          {(mode === 'register' || loginType === 'password') && (
            <View className='form-item'>
              <Text className='label'>{mode === 'login' ? '密码' : '设置密码'}</Text>
              <View className='password-wrap'>
                <Input
                  className='input'
                  password={!showPassword}
                  placeholder='请输入密码'
                  value={password}
                  onInput={(e) => setPassword(e.detail.value)}
                />
                <Text 
                  className='toggle-eye' 
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? '🙈' : '👁️'}
                </Text>
              </View>
            </View>
          )}

          {/* 验证码输入 */}
          {((mode === 'register' && !TEST_REGISTER_NO_CODE) || (mode === 'login' && loginType === 'sms')) && (
            <View className='form-item'>
              <Text className='label'>验证码</Text>
              <View className='sms-wrap'>
                <Input
                  className='input sms-input'
                  type='number'
                  placeholder='请输入6位验证码'
                  value={smsCode}
                  onInput={(e) => setSmsCode(e.detail.value)}
                  maxlength={6}
                />
                <View 
                  className={`send-btn ${countdown > 0 ? 'disabled' : ''}`}
                  onClick={handleSendCode}
                >
                  <Text>{countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
                </View>
              </View>
              {devCode && !isRealSmsEnabled() && (
                <Text className='dev-code-hint'>开发模式验证码: {devCode}</Text>
              )}
            </View>
          )}

          {mode === 'register' && (
            <View className='form-item'>
              <Text className='label'>确认密码</Text>
              <Input
                className='input'
                password
                placeholder='请再次输入密码'
                value={confirmPassword}
                onInput={(e) => setConfirmPassword(e.detail.value)}
              />
            </View>
          )}

          <View 
            className={`submit-btn ${loading ? 'loading' : ''}`}
            onClick={mode === 'login' ? handleLogin : handleRegister}
          >
            <Text>{loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}</Text>
          </View>

          {mode === 'register' && (
            <View className='tips'>
              <Text className='tip'>🧪 当前为测试模式：注册无需验证码</Text>
            </View>
          )}
        </View>
      </View>

      <View className='footer'>
        <Text>KIDDA EDUCATION CLOUD PLATFORM</Text>
      </View>
    </View>
  )
}
