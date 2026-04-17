import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Picker, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { deleteItem, loadPaymentsFromBackend, saveItem, STORAGE_KEYS } from '../../services/dataService'
import { AUTH_TOKEN_KEY } from '../../services/qideApi'
import {
  getAssignedClasses,
  getCurrentUser,
  isFinance,
  isTeacher,
  redirectToProfileSetupIfNeeded,
} from '../../utils/userAccess'
import './index.scss'

interface Payment {
  id: string
  studentId: string
  studentName: string
  studentClass: string
  campus?: string
  amount: number
  feeType: string
  feeDetails?: { key: string; label: string; price: number }[]
  periodType: string
  paymentMethod: string
  status: string
  paymentDate: string
  notes?: string
}

const PAYMENT_METHOD_OPTIONS = ['微信', '支付宝', '现金', '转账']
const METHOD_MAP: Record<string, string> = { 微信: 'wechat', 支付宝: 'alipay', 现金: 'cash', 转账: 'transfer' }
const METHOD_ICON: Record<string, string> = { wechat: '💬', alipay: '💙', cash: '💵', transfer: '🏦' }
const FEE_TYPE_OPTIONS = ['学费', '伙食费', '校车费', '兴趣班', '教材费', '其他']

export default function Finance() {
  const currentUser = getCurrentUser()
  const teacherRole = isTeacher(currentUser)
  const financeRole = isFinance(currentUser)
  const assignedClasses = getAssignedClasses(currentUser)

  const [payments, setPayments] = useState<Payment[]>([])
  const [viewMode, setViewMode] = useState<'dashboard' | 'overview' | 'list' | 'add'>('dashboard')
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))
  const [filterClass, setFilterClass] = useState(teacherRole && assignedClasses[0] ? assignedClasses[0] : '全部')
  const [addForm, setAddForm] = useState({
    studentName: '',
    studentClass: teacherRole ? assignedClasses[0] || '' : '',
    amount: '',
    feeType: FEE_TYPE_OPTIONS[0],
    paymentMethod: PAYMENT_METHOD_OPTIONS[0],
    notes: '',
  })

  useEffect(() => {
    void loadPayments()
  }, [])

  useDidShow(() => {
    if (redirectToProfileSetupIfNeeded('finance')) return
    void loadPayments()
  })

  const loadPayments = async () => {
    const scopedByClass = teacherRole && assignedClasses.length > 0
    const data = await loadPaymentsFromBackend({
      campus: scopedByClass ? undefined : currentUser?.campus,
      classNames: teacherRole ? assignedClasses : undefined,
    })
    setPayments(data)
    if (teacherRole && assignedClasses[0]) {
      setFilterClass(assignedClasses[0])
    }
  }

  const classOptions = useMemo(() => {
    if (teacherRole && assignedClasses.length) return assignedClasses

    const set = new Set<string>()
    payments.forEach((payment) => {
      if (payment.studentClass) set.add(payment.studentClass)
    })
    return ['全部', ...Array.from(set).filter(Boolean)]
  }, [assignedClasses, payments, teacherRole])

  const todayStr = new Date().toISOString().split('T')[0]
  const visiblePayments = teacherRole
    ? payments.filter((payment) => assignedClasses.includes(payment.studentClass))
    : payments

  const filteredByMonth = visiblePayments.filter((payment) => {
    const matchMonth = payment.paymentDate?.startsWith(filterMonth)
    const matchClass = teacherRole
      ? assignedClasses.includes(payment.studentClass)
      : filterClass === '全部' || payment.studentClass === filterClass
    return matchMonth && matchClass
  })

  const todayPayments = visiblePayments.filter((payment) => payment.paymentDate?.startsWith(todayStr))
  const todayAmount = todayPayments.reduce((sum, payment) => sum + payment.amount, 0)
  const monthAmount = filteredByMonth.reduce((sum, payment) => sum + payment.amount, 0)

  const classDistribution = classOptions
    .filter((className) => className !== '全部')
    .map((className) => ({
      name: className,
      amount: filteredByMonth.filter((payment) => payment.studentClass === className).reduce((sum, payment) => sum + payment.amount, 0),
      count: filteredByMonth.filter((payment) => payment.studentClass === className).length,
    }))
    .filter((item) => item.count > 0)

  const handleLogout = () => {
    Taro.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (!res.confirm) return
        Taro.removeStorageSync('kt_current_user')
        Taro.removeStorageSync(AUTH_TOKEN_KEY)
        Taro.redirectTo({ url: '/pages/login/index' })
      },
    })
  }

  const handleAddPayment = async () => {
    if (!financeRole) {
      Taro.showToast({ title: '教师账号只能查看收费数据', icon: 'none' })
      return
    }

    if (!addForm.studentName.trim()) {
      Taro.showToast({ title: '请输入学生姓名', icon: 'none' })
      return
    }
    if (!addForm.amount || Number(addForm.amount) <= 0) {
      Taro.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }

    const payment: Payment = {
      id: `pay_${Date.now()}`,
      studentId: '',
      studentName: addForm.studentName.trim(),
      studentClass: addForm.studentClass,
      campus: currentUser?.campus,
      amount: Number(addForm.amount),
      feeType: addForm.feeType,
      paymentMethod: METHOD_MAP[addForm.paymentMethod] || 'cash',
      periodType: 'monthly',
      status: 'paid',
      paymentDate: new Date().toISOString(),
      notes: addForm.notes,
    }

    const result = await saveItem(STORAGE_KEYS.PAYMENTS, payment)
    if (!result.success) {
      Taro.showToast({ title: result.error || '录入失败', icon: 'none' })
      return
    }

    setAddForm({
      studentName: '',
      studentClass: '',
      amount: '',
      feeType: FEE_TYPE_OPTIONS[0],
      paymentMethod: PAYMENT_METHOD_OPTIONS[0],
      notes: '',
    })
    await loadPayments()
    setViewMode('dashboard')
    Taro.showToast({ title: '收费已录入', icon: 'success' })
  }

  const deletePayment = async (id: string) => {
    if (!financeRole) {
      Taro.showToast({ title: '教师账号只能查看缴费记录', icon: 'none' })
      return
    }

    Taro.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定继续吗？',
      success: async (res) => {
        if (!res.confirm) return
        await deleteItem(STORAGE_KEYS.PAYMENTS, id)
        setPayments((prev) => prev.filter((payment) => payment.id !== id))
        Taro.showToast({ title: '已删除', icon: 'success' })
      },
    })
  }

  const getMethodIcon = (method: string) => METHOD_ICON[method] || '💰'
  const getMethodLabel = (method: string) => {
    const map: Record<string, string> = { wechat: '微信', alipay: '支付宝', cash: '现金', transfer: '转账' }
    return map[method] || method
  }

  const renderDashboard = () => (
    <ScrollView className='dashboard-scroll' scrollY>
      <View className='workspace-header'>
        <View className='workspace-greeting'>
          <Text className='workspace-hello'>您好，</Text>
          <Text className='workspace-name'>{currentUser?.name || '老师'}</Text>
        </View>
        <View className={`workspace-role-badge ${teacherRole ? 'teacher' : 'finance'}`}>
          <Text className='role-text'>{teacherRole ? '教师查看模式' : '财务'}</Text>
        </View>
      </View>

      <View className='priority-banner'>
        <Text className='priority-text'>
          {teacherRole ? '当前仅展示本班收费概览和缴费记录。' : '请优先核对本月收费数据。'}
        </Text>
      </View>

      <View className='dashboard-stats'>
        <View className='dash-stat-card green'>
          <Text className='stat-number'>¥{monthAmount.toLocaleString()}</Text>
          <Text className='stat-label'>{teacherRole ? '本班本月收费' : '本月收费总额'}</Text>
        </View>
        <View className='dash-stat-card amber'>
          <Text className='stat-number'>¥{todayAmount.toLocaleString()}</Text>
          <Text className='stat-label'>{teacherRole ? '本班今日缴费' : '今日新增收费'}</Text>
        </View>
        <View className='dash-stat-card red'>
          <Text className='stat-number'>{filteredByMonth.length}</Text>
          <Text className='stat-label'>{teacherRole ? '本班缴费笔数' : '本月交易笔数'}</Text>
        </View>
      </View>

      <View className='dashboard-section'>
        <View className='section-header-row'>
          <Text className='section-title'>收费概览</Text>
          <Text className='section-link' onClick={() => setViewMode('overview')}>查看详情 &gt;</Text>
        </View>
        <View className='overview-row'>
          <View className='overview-item'>
            <Text className='ov-value'>{filteredByMonth.length}</Text>
            <Text className='ov-label'>缴费笔数</Text>
          </View>
          <View className='overview-item'>
            <Text className='ov-value'>{classDistribution.length}</Text>
            <Text className='ov-label'>{teacherRole ? '显示班级' : '涉及班级'}</Text>
          </View>
          <View className='overview-item'>
            <Text className='ov-value'>¥{todayPayments.length ? Math.round(todayAmount / todayPayments.length) : 0}</Text>
            <Text className='ov-label'>今日笔均</Text>
          </View>
        </View>
      </View>

      <View className='dashboard-section'>
        <View className='section-header-row'>
          <Text className='section-title'>{teacherRole ? '本班最近缴费' : '最近缴费记录'}</Text>
          <Text className='section-link' onClick={() => setViewMode('list')}>全部 &gt;</Text>
        </View>
        {visiblePayments.slice(0, 5).map((payment) => (
          <View key={payment.id} className='recent-payment-row'>
            <View className='rp-info'>
              <Text className='rp-name'>{payment.studentName}</Text>
              <Text className='rp-meta'>{payment.studentClass} · {new Date(payment.paymentDate).toLocaleDateString()}</Text>
            </View>
            <Text className='rp-amount'>¥{payment.amount.toLocaleString()}</Text>
          </View>
        ))}
        {visiblePayments.length === 0 && <Text className='empty-hint'>暂无缴费记录</Text>}
      </View>

      {classDistribution.length > 0 && (
        <View className='dashboard-section'>
          <Text className='section-title'>{teacherRole ? '本班收费分布' : '班级收费分布'}</Text>
          {classDistribution.map((item) => (
            <View key={item.name} className='class-bar-row'>
              <Text className='class-bar-name'>{item.name}</Text>
              <View className='class-bar-track'>
                <View className='class-bar-fill' style={{ width: `${Math.min((item.amount / (monthAmount || 1)) * 100, 100)}%` }} />
              </View>
              <Text className='class-bar-val'>¥{item.amount.toLocaleString()}</Text>
            </View>
          ))}
        </View>
      )}

      <View className='dashboard-section'>
        <Text className='section-title'>快捷入口</Text>
        <View className='quick-entry-grid'>
          <View className='quick-entry-item' onClick={() => setViewMode('overview')}>
            <Text className='entry-icon'>📊</Text>
            <Text className='entry-label'>收费概览</Text>
          </View>
          <View className='quick-entry-item' onClick={() => setViewMode('list')}>
            <Text className='entry-icon'>📒</Text>
            <Text className='entry-label'>缴费记录</Text>
          </View>
          {financeRole && (
            <View className='quick-entry-item' onClick={() => setViewMode('add')}>
              <Text className='entry-icon'>➕</Text>
              <Text className='entry-label'>收费录入</Text>
            </View>
          )}
        </View>
      </View>

      <View className='logout-section' onClick={handleLogout}>
        <Text className='logout-text'>退出登录</Text>
      </View>

      <View style={{ height: '120rpx' }} />
    </ScrollView>
  )

  const renderOverview = () => {
    const wechatAmount = filteredByMonth.filter((payment) => payment.paymentMethod === 'wechat').reduce((sum, payment) => sum + payment.amount, 0)
    const alipayAmount = filteredByMonth.filter((payment) => payment.paymentMethod === 'alipay').reduce((sum, payment) => sum + payment.amount, 0)
    const cashAmount = filteredByMonth.filter((payment) => payment.paymentMethod === 'cash').reduce((sum, payment) => sum + payment.amount, 0)
    const transferAmount = filteredByMonth.filter((payment) => payment.paymentMethod === 'transfer').reduce((sum, payment) => sum + payment.amount, 0)

    return (
      <ScrollView className='dashboard-scroll' scrollY>
        <View className='sub-header'>
          <View className='back-btn' onClick={() => setViewMode('dashboard')}><Text>返回工作台</Text></View>
          <Text className='sub-title'>收费概览</Text>
        </View>

        <View className='ov-filter-bar'>
          <Picker mode='date' fields='month' value={filterMonth} onChange={(e) => setFilterMonth(e.detail.value)}>
            <View className='ov-filter-chip'><Text className='ov-filter-text'>{filterMonth}</Text></View>
          </Picker>
          <Picker mode='selector' range={classOptions} onChange={(e) => setFilterClass(classOptions[Number(e.detail.value)])}>
            <View className='ov-filter-chip'><Text className='ov-filter-text'>{filterClass}</Text></View>
          </Picker>
        </View>

        <View className='ov-hero-card'>
          <Text className='ov-hero-label'>{teacherRole ? '本班本月收费净额' : '本月收费净额'}</Text>
          <Text className='ov-hero-amount'>¥{monthAmount.toLocaleString()}</Text>
        </View>

        <View className='ov-method-section'>
          <View className='ov-method-grid'>
            {[
              { key: 'wechat', label: '微信', amount: wechatAmount, color: 'green' },
              { key: 'alipay', label: '支付宝', amount: alipayAmount, color: 'blue' },
              { key: 'cash', label: '现金', amount: cashAmount, color: 'amber' },
              { key: 'transfer', label: '转账', amount: transferAmount, color: 'purple' },
            ].map((item) => (
              <View key={item.key} className={`ov-method-card ov-method-${item.color}`}>
                <Text className='ov-method-label'>{item.label}</Text>
                <Text className='ov-method-amount'>¥{item.amount.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className='ov-class-section'>
          {classDistribution.map((item) => (
            <View key={item.name} className='ov-class-row'>
              <View className='ov-class-info'>
                <Text className='ov-class-name'>{item.name}</Text>
                <Text className='ov-class-count'>{item.count}笔</Text>
              </View>
              <View className='ov-class-right'>
                <Text className='ov-class-amount'>¥{item.amount.toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: '120rpx' }} />
      </ScrollView>
    )
  }

  const renderList = () => (
    <ScrollView className='dashboard-scroll' scrollY>
      <View className='sub-header'>
        <View className='back-btn' onClick={() => setViewMode('dashboard')}><Text>返回工作台</Text></View>
        <Text className='sub-title'>缴费记录</Text>
      </View>

      <View className='filter-bar'>
        <Picker mode='date' fields='month' value={filterMonth} onChange={(e) => setFilterMonth(e.detail.value)}>
          <View className='filter-item'><Text className='label'>{filterMonth}</Text></View>
        </Picker>
        <Picker mode='selector' range={classOptions} onChange={(e) => setFilterClass(classOptions[Number(e.detail.value)])}>
          <View className='filter-item'><Text className='label'>{filterClass}</Text></View>
        </Picker>
      </View>

      {filteredByMonth.map((payment) => (
        <View key={payment.id} className='payment-card'>
          <View className='card-header'>
            <View className='student'>
              <Text className='name'>{payment.studentName}</Text>
              <Text className='class'>{payment.studentClass}</Text>
            </View>
            <Text className='amount'>¥{payment.amount.toLocaleString()}</Text>
          </View>
          <View className='card-body'>
            <View className='info-row'>
              <Text className='label'>支付方式</Text>
              <Text className='value'>{getMethodIcon(payment.paymentMethod)} {getMethodLabel(payment.paymentMethod)}</Text>
            </View>
            <View className='info-row'>
              <Text className='label'>缴费项目</Text>
              <Text className='value'>{payment.feeDetails?.map((item) => item.label).join('、') || payment.feeType}</Text>
            </View>
            <View className='info-row'>
              <Text className='label'>缴费时间</Text>
              <Text className='value'>{new Date(payment.paymentDate).toLocaleString()}</Text>
            </View>
            {payment.notes && (
              <View className='info-row'>
                <Text className='label'>备注</Text>
                <Text className='value'>{payment.notes}</Text>
              </View>
            )}
          </View>
          {financeRole && (
            <View className='card-footer'>
              <View className='action-btn delete-btn' onClick={() => void deletePayment(payment.id)}>
                <Text>删除</Text>
              </View>
            </View>
          )}
        </View>
      ))}

      {filteredByMonth.length === 0 && (
        <View className='empty-large'>
          <Text className='text'>暂无缴费记录</Text>
        </View>
      )}

      <View style={{ height: '120rpx' }} />
    </ScrollView>
  )

  const renderAdd = () => (
    <ScrollView className='dashboard-scroll' scrollY>
      <View className='sub-header'>
        <View className='back-btn' onClick={() => setViewMode('dashboard')}><Text>返回工作台</Text></View>
        <Text className='sub-title'>收费录入</Text>
      </View>

      <View className='add-form'>
        <View className='form-group'>
          <Text className='group-title'>学生信息</Text>
          <View className='form-item'>
            <Text className='label'>学生姓名</Text>
            <Input className='input' value={addForm.studentName} onInput={(e) => setAddForm((prev) => ({ ...prev, studentName: e.detail.value }))} />
          </View>
          <View className='form-item'>
            <Text className='label'>班级</Text>
            <Picker mode='selector' range={classOptions.filter((item) => item !== '全部')} onChange={(e) => setAddForm((prev) => ({ ...prev, studentClass: classOptions.filter((item) => item !== '全部')[Number(e.detail.value)] }))}>
              <View className='picker-value'>
                <Text className={addForm.studentClass ? '' : 'placeholder'}>{addForm.studentClass || '请选择班级'}</Text>
                <Text className='picker-arrow'>▼</Text>
              </View>
            </Picker>
          </View>
        </View>

        <View className='form-group'>
          <Text className='group-title'>收费信息</Text>
          <View className='form-item'>
            <Text className='label'>金额</Text>
            <Input className='input' type='digit' value={addForm.amount} onInput={(e) => setAddForm((prev) => ({ ...prev, amount: e.detail.value }))} />
          </View>
          <View className='form-item'>
            <Text className='label'>收费项目</Text>
            <Picker mode='selector' range={FEE_TYPE_OPTIONS} onChange={(e) => setAddForm((prev) => ({ ...prev, feeType: FEE_TYPE_OPTIONS[Number(e.detail.value)] }))}>
              <View className='picker-value'><Text>{addForm.feeType}</Text><Text className='picker-arrow'>▼</Text></View>
            </Picker>
          </View>
          <View className='form-item'>
            <Text className='label'>支付方式</Text>
            <Picker mode='selector' range={PAYMENT_METHOD_OPTIONS} onChange={(e) => setAddForm((prev) => ({ ...prev, paymentMethod: PAYMENT_METHOD_OPTIONS[Number(e.detail.value)] }))}>
              <View className='picker-value'><Text>{addForm.paymentMethod}</Text><Text className='picker-arrow'>▼</Text></View>
            </Picker>
          </View>
          <View className='form-item'>
            <Text className='label'>备注</Text>
            <Input className='input' value={addForm.notes} onInput={(e) => setAddForm((prev) => ({ ...prev, notes: e.detail.value }))} />
          </View>
        </View>

        <View className='add-actions'>
          <View className='add-btn cancel' onClick={() => setViewMode('dashboard')}><Text>取消</Text></View>
          <View className='add-btn confirm' onClick={() => void handleAddPayment()}><Text>确认录入</Text></View>
        </View>
      </View>
    </ScrollView>
  )

  return (
    <View className='finance-page'>
      {viewMode === 'dashboard' && renderDashboard()}
      {viewMode === 'overview' && renderOverview()}
      {viewMode === 'list' && renderList()}
      {viewMode === 'add' && renderAdd()}
    </View>
  )
}
