import { useEffect, useState } from 'react'
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
import { DEFAULT_CAMPUSES, isProfileComplete } from '../../utils/userAccess'
import './index.scss'

const AVAILABLE_ROLES = [
  { role: 'ADMIN', label: '园区管理员', icon: '👨‍💼' },
  { role: 'TEACHER', label: '教师', icon: '👩‍🏫' },
  { role: 'KITCHEN', label: '厨房人员', icon: '👨‍🍳' },
  { role: 'FINANCE', label: '财务人员', icon: '💰' },
]

const TEST_REGISTER_NO_CODE = true
const TEST_REGISTER_CODE = '000000'

interface User {
  id: string
  phone: string
  name: string
  role: string
  campus?: string
}

function safeToast(title?: string, icon: 'success' | 'none' = 'none') {
  Taro.showToast({
    title: title || '操作完成',
    icon,
  })
}

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loginType, setLoginType] = useState<'password' | 'sms'>('password')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [selectedRole, setSelectedRole] = useState('TEACHER')
  const [selectedCampus, setSelectedCampus] = useState(DEFAULT_CAMPUSES[0])
  const [smsCode, setSmsCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [devCode, setDevCode] = useState('')

  useEffect(() => {
    const user = Taro.getStorageSync('kt_current_user')
    if (!user) return

    if (!isProfileComplete(user)) {
      Taro.redirectTo({ url: '/pages/profile/setup?from=login' })
      return
    }

    void safeGo('/pages/index/index')
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const syncAfterLogin = async () => {
    Taro.showLoading({ title: '同步数据中...' })
    try {
      const currentUser = Taro.getStorageSync('kt_current_user') || {}
      await syncAllFromCloud(currentUser.campus)
    } catch (error) {
      console.error('[login] sync failed', error)
    } finally {
      Taro.hideLoading()
    }
  }

  const routeAfterLogin = (user: User) => {
    const role = (user.role || '').toUpperCase()
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

  const onLoginSuccess = async (user: User, token?: string) => {
    if (token) {
      Taro.setStorageSync(AUTH_TOKEN_KEY, token)
    }
    Taro.setStorageSync('kt_current_user', user)

    if (!isProfileComplete(user as any)) {
      safeToast('请先完善个人信息')
      setTimeout(() => {
        Taro.redirectTo({ url: '/pages/profile/setup?from=login' })
      }, 300)
      return
    }

    await syncAfterLogin()
    safeToast('登录成功', 'success')
    setTimeout(() => routeAfterLogin(user), 400)
  }

  const handleSendCode = async () => {
    if (!/^1\d{10}$/.test(phone.trim())) {
      safeToast('请输入有效手机号')
      return
    }
    if (countdown > 0) return

    Taro.showLoading({ title: '发送中...' })
    try {
      let result: any
      try {
        result = await sendQideVerificationCode(phone)
      } catch {
        result = await sendLocalVerificationCode(phone)
      }

      if (result?.success) {
        setCountdown(60)
        if (result.code) {
          setDevCode(result.code)
          Taro.showModal({
            title: '开发模式验证码',
            content: `验证码：${result.code}`,
            showCancel: false,
          })
        } else {
          safeToast(result?.message || '验证码已发送', 'success')
        }
      } else {
        safeToast(result?.message || '发送失败')
      }
    } catch (error) {
      console.error('[login] send code failed', error)
      safeToast('发送失败，请重试')
    } finally {
      Taro.hideLoading()
    }
  }

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
    } catch (error: any) {
      safeToast(error?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSmsLogin = async () => {
    if (!/^1\d{10}$/.test(phone.trim())) {
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
    } catch (error: any) {
      safeToast(error?.message || '验证失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    if (loginType === 'password') {
      await handlePasswordLogin()
      return
    }
    await handleSmsLogin()
  }

  const handleRegister = async () => {
    if (!/^1\d{10}$/.test(phone.trim())) {
      safeToast('请输入有效手机号')
      return
    }
    if (!name.trim()) {
      safeToast('请输入姓名')
      return
    }
    if (password.length < 6) {
      safeToast('密码至少 6 位')
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
    try {
      const result = await staffRegister(
        phone,
        TEST_REGISTER_NO_CODE ? TEST_REGISTER_CODE : smsCode,
        password,
        {
          name,
          role: selectedRole,
          campus: selectedCampus,
        },
      )
      await onLoginSuccess(toLocalUser(result.data.staff), result.data.token)
    } catch (error: any) {
      safeToast(error?.message || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className='login-page'>
      <View className='form-card'>
        <View className='header-bg'>
          <View className='logo'>
            <Text className='logo-icon'>🌶</Text>
            <Text className='logo-text'>金星幼儿园</Text>
          </View>
          <Text className='subtitle'>自然 · 养育 · 成长</Text>
        </View>

        <View className='mode-tabs'>
          <View className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            <Text>登录</Text>
          </View>
          <View className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
            <Text>注册</Text>
          </View>
        </View>

        {mode === 'login' && (
          <View className='login-type-tabs'>
            <View className={`type-tab ${loginType === 'password' ? 'active' : ''}`} onClick={() => setLoginType('password')}>
              <Text>密码登录</Text>
            </View>
            <View className={`type-tab ${loginType === 'sms' ? 'active' : ''}`} onClick={() => setLoginType('sms')}>
              <Text>验证码登录</Text>
            </View>
          </View>
        )}

        <View className='form'>
          {mode === 'register' && (
            <>
              <View className='form-item'>
                <Text className='label'>您的姓名</Text>
                <Input className='input' placeholder='请输入姓名' value={name} onInput={(e) => setName(e.detail.value)} />
              </View>

              <View className='form-item'>
                <Text className='label'>选择角色</Text>
                <View className='role-grid'>
                  {AVAILABLE_ROLES.map((item) => (
                    <View
                      key={item.role}
                      className={`role-item ${selectedRole === item.role ? 'active' : ''}`}
                      onClick={() => setSelectedRole(item.role)}
                    >
                      <Text className='role-icon'>{item.icon}</Text>
                      <Text className='role-label'>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className='form-item'>
                <Text className='label'>所属园区</Text>
                <View className='campus-list'>
                  {DEFAULT_CAMPUSES.map((item) => (
                    <View
                      key={item}
                      className={`campus-item ${selectedCampus === item ? 'active' : ''}`}
                      onClick={() => setSelectedCampus(item)}
                    >
                      <Text>{item}</Text>
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
              placeholder='请输入手机号'
              value={phone}
              onInput={(e) => setPhone(e.detail.value)}
              maxlength={mode === 'login' && loginType === 'password' ? 20 : 11}
            />
          </View>

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
                <Text className='toggle-eye' onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? '🙈' : '👁️'}
                </Text>
              </View>
            </View>
          )}

          {((mode === 'register' && !TEST_REGISTER_NO_CODE) || (mode === 'login' && loginType === 'sms')) && (
            <View className='form-item'>
              <Text className='label'>验证码</Text>
              <View className='sms-wrap'>
                <Input
                  className='input sms-input'
                  type='number'
                  placeholder='请输入 6 位验证码'
                  value={smsCode}
                  onInput={(e) => setSmsCode(e.detail.value)}
                  maxlength={6}
                />
                <View className={`send-btn ${countdown > 0 ? 'disabled' : ''}`} onClick={handleSendCode}>
                  <Text>{countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
                </View>
              </View>
              {devCode && !isRealSmsEnabled() && (
                <Text className='dev-code-hint'>开发模式验证码：{devCode}</Text>
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

          <View className={`submit-btn ${loading ? 'loading' : ''}`} onClick={() => void (mode === 'login' ? handleLogin() : handleRegister())}>
            <Text>{loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}</Text>
          </View>

          {mode === 'register' && (
            <View className='tips'>
              <Text className='tip'>首次登录后需要继续完善个人信息，教师还需选择负责班级。</Text>
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
