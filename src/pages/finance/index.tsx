import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Picker, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { deleteItem, loadPaymentsFromBackend, saveItem, STORAGE_KEYS } from '../../services/dataService'
import { AUTH_TOKEN_KEY } from '../../services/qideApi'

import './index.scss'

interface Payment {
  id: string
  studentId: string
  studentName: string
  studentClass: string
  amount: number
  feeType: string
  feeDetails?: { key: string; label: string; price: number }[]
  periodType: string
  paymentMethod: string
  status: string
  paymentDate: string
  notes?: string
}

const CLASSES = ['全部', '托班', '小一班', '小二班', '中一班', '中二班', '大一班', '大二班']

const FEE_TYPE_OPTIONS = ['学费', '伙食费', '校车费', '兴趣班', '教材费', '其他']
const PAYMENT_METHOD_OPTIONS = ['微信', '支付宝', '现金', '转账']
const METHOD_MAP: Record<string, string> = { '微信': 'wechat', '支付宝': 'alipay', '现金': 'cash', '转账': 'transfer' }
const METHOD_ICON: Record<string, string> = { wechat: '💚', alipay: '💙', cash: '💵', transfer: '🏦' }

export default function Finance() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [viewMode, setViewMode] = useState<'dashboard' | 'overview' | 'list' | 'add' | 'arrears'>('dashboard')
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))
  const [filterClass, setFilterClass] = useState('全部')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isFinance, setIsFinance] = useState(false)

  const [addForm, setAddForm] = useState({
    studentName: '',
    studentClass: '',
    amount: '',
    feeType: FEE_TYPE_OPTIONS[0],
    paymentMethod: PAYMENT_METHOD_OPTIONS[0],
    notes: '',
  })

  useEffect(() => {
    void loadPayments()
    const user = Taro.getStorageSync('kt_current_user')
    setCurrentUser(user)
    setIsFinance(user?.role === 'FINANCE')
  }, [])

  useDidShow(() => {
    void loadPayments()
  })

  const loadPayments = async () => {
    const data = await loadPaymentsFromBackend()
    setPayments(data)
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const thisMonth = filterMonth

  const todayPayments = payments.filter(p => p.paymentDate?.startsWith(todayStr))
  const todayAmount = todayPayments.reduce((s, p) => s + p.amount, 0)

  const monthPayments = payments.filter(p => {
    const matchMonth = p.paymentDate?.startsWith(thisMonth)
    const matchClass = filterClass === '全部' || p.studentClass === filterClass
    return matchMonth && matchClass
  })
  const monthAmount = monthPayments.reduce((s, p) => s + p.amount, 0)

  const arrearsStudents = payments.filter(p => p.status === 'arrears' || p.status === 'pending')
  const abnormalCount = arrearsStudents.length

  const classDistribution = CLASSES.slice(1).map(cls => ({
    name: cls,
    amount: payments.filter(p => p.studentClass === cls && p.paymentDate?.startsWith(thisMonth))
      .reduce((s, p) => s + p.amount, 0),
    count: payments.filter(p => p.studentClass === cls && p.paymentDate?.startsWith(thisMonth)).length,
  })).filter(c => c.amount > 0)

  const handleLogout = () => {
    Taro.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          Taro.removeStorageSync('kt_current_user')
          Taro.removeStorageSync(AUTH_TOKEN_KEY)
          Taro.redirectTo({ url: '/pages/login/index' })
        }
      }
    })
  }

  const handleAddPayment = async () => {
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
      amount: Number(addForm.amount),
      feeType: addForm.feeType,
      paymentMethod: METHOD_MAP[addForm.paymentMethod] || 'cash',
      periodType: 'monthly',
      status: 'paid',
      paymentDate: new Date().toISOString(),
      notes: addForm.notes,
    }

    const result = await saveItem(STORAGE_KEYS.PAYMENTS, payment)
    if (result.success) {
      Taro.showToast({ title: '收费已录入', icon: 'success' })
      setAddForm({ studentName: '', studentClass: '', amount: '', feeType: FEE_TYPE_OPTIONS[0], paymentMethod: PAYMENT_METHOD_OPTIONS[0], notes: '' })
      void loadPayments()
      setViewMode('dashboard')
    } else {
      Taro.showToast({ title: result.error || '录入失败', icon: 'none' })
    }
  }

  const deletePayment = async (id: string) => {
    Taro.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确认？',
      success: async (res) => {
        if (res.confirm) {
          await deleteItem(STORAGE_KEYS.PAYMENTS, id)
          setPayments(prev => prev.filter(p => p.id !== id))
          Taro.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }

  const handleRefund = (payment: Payment) => {
    Taro.showModal({
      title: '退款计算',
      content: `学生：${payment.studentName}\n金额：¥${payment.amount}\n\n将按缺勤天数比例自动计算退款金额，确认退款？`,
      success: async (res) => {
        if (res.confirm) {
          const today = new Date()
          const absentDays: number[] = []
          for (let i = 0; i < 30; i++) {
            const d = new Date(today)
            d.setDate(d.getDate() - i)
            const dateStr = d.toISOString().split('T')[0]
            const att = Taro.getStorageSync(`kt_attendance_${dateStr}`) || {}
            const rec = att[payment.studentId]
            if (rec && (rec.status === 'absent' || rec.status === 'sick')) {
              absentDays.push(i)
            }
          }
          const workDays = 22
          const refundRate = Math.min(absentDays.length / workDays, 0.5)
          const refundAmount = Math.round(payment.amount * refundRate * 100) / 100

          const refundPayment: Payment = {
            id: `refund_${Date.now()}`,
            studentId: payment.studentId,
            studentName: payment.studentName,
            studentClass: payment.studentClass,
            amount: -refundAmount,
            feeType: '退款',
            paymentMethod: payment.paymentMethod,
            periodType: 'refund',
            status: 'refunded',
            paymentDate: new Date().toISOString(),
            notes: `缺勤${absentDays.length}天，退款比例${(refundRate * 100).toFixed(1)}%`,
          }
          await saveItem(STORAGE_KEYS.PAYMENTS, refundPayment)
          void loadPayments()
          Taro.showToast({ title: `已退款¥${refundAmount}`, icon: 'success' })
        }
      }
    })
  }

  const getMethodIcon = (method: string) => METHOD_ICON[method] || '💰'
  const getMethodLabel = (method: string) => {
    const map: Record<string, string> = { wechat: '微信', alipay: '支付宝', cash: '现金', transfer: '转账' }
    return map[method] || method
  }
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const getPriorityText = (): string => {
    if (abnormalCount > 0) return `今日优先跟进${abnormalCount}笔欠费/异常收费`
    if (monthPayments.length === 0) return '先核对本周未缴费名单'
    return '先检查异常退费和漏录'
  }

  // ========== Dashboard ==========
  const renderDashboard = () => {
    return (
      <ScrollView className='dashboard-scroll' scrollY>
        <View className='workspace-header'>
          <View className='workspace-greeting'>
            <Text className='workspace-hello'>您好，</Text>
            <Text className='workspace-name'>{currentUser?.name || '财务'}</Text>
          </View>
          <View className='workspace-role-badge finance'>
            <Text className='role-icon'>💰</Text>
            <Text className='role-text'>财务</Text>
          </View>
        </View>

        <View className='priority-banner'>
          <Text className='priority-icon'>🔔</Text>
          <Text className='priority-text'>{getPriorityText()}</Text>
        </View>

        <View className='dashboard-stats'>
          <View className='dash-stat-card green'>
            <Text className='stat-number'>¥{monthAmount.toLocaleString()}</Text>
            <Text className='stat-label'>本月收费总额</Text>
          </View>
          <View className='dash-stat-card amber'>
            <Text className='stat-number'>¥{todayAmount.toLocaleString()}</Text>
            <Text className='stat-label'>今日新增收费</Text>
          </View>
          <View className='dash-stat-card red'>
            <Text className='stat-number'>{abnormalCount}</Text>
            <Text className='stat-label'>待跟进异常</Text>
          </View>
        </View>

        <View className='dashboard-section'>
          <View className='section-header-row'>
            <Text className='section-title'>📊 本月收费概览</Text>
            <Text className='section-link' onClick={() => setViewMode('overview')}>查看详情 &gt;</Text>
          </View>
          <View className='overview-row'>
            <View className='overview-item'>
              <Text className='ov-value'>{monthPayments.length}</Text>
              <Text className='ov-label'>交易笔数</Text>
            </View>
            <View className='overview-item'>
              <Text className='ov-value'>{classDistribution.length}</Text>
              <Text className='ov-label'>涉及班级</Text>
            </View>
            <View className='overview-item'>
              <Text className='ov-value'>¥{monthPayments.filter(p => p.paymentMethod === 'wechat').reduce((s, p) => s + p.amount, 0).toLocaleString()}</Text>
              <Text className='ov-label'>微信收款</Text>
            </View>
          </View>
        </View>

        <View className='dashboard-section'>
          <View className='section-header-row'>
            <Text className='section-title'>🧾 最近缴费记录</Text>
            <Text className='section-link' onClick={() => setViewMode('list')}>全部 &gt;</Text>
          </View>
          {payments.slice(0, 5).map(p => (
            <View key={p.id} className='recent-payment-row'>
              <View className='rp-info'>
                <Text className='rp-name'>{p.studentName}</Text>
                <Text className='rp-meta'>{p.studentClass} · {formatDate(p.paymentDate)}</Text>
              </View>
              <Text className={`rp-amount ${p.amount < 0 ? 'refund' : ''}`}>{p.amount < 0 ? '-' : ''}¥{Math.abs(p.amount).toLocaleString()}</Text>
            </View>
          ))}
          {payments.length === 0 && <Text className='empty-hint'>暂无缴费记录</Text>}
        </View>

        {arrearsStudents.length > 0 && (
          <View className='dashboard-section alert-section'>
            <View className='section-header-row'>
              <Text className='section-title'>⚠️ 欠费/待跟进</Text>
              <Text className='section-link' onClick={() => setViewMode('arrears')}>查看全部 &gt;</Text>
            </View>
            {arrearsStudents.slice(0, 3).map(p => (
              <View key={p.id} className='arrears-row'>
                <View className='arr-info'>
                  <Text className='arr-name'>{p.studentName}</Text>
                  <Text className='arr-class'>{p.studentClass}</Text>
                </View>
                <Text className='arr-amount'>¥{p.amount.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        )}

        {classDistribution.length > 0 && (
          <View className='dashboard-section'>
            <Text className='section-title'>📈 班级收费分布</Text>
            {classDistribution.map(c => (
              <View key={c.name} className='class-bar-row'>
                <Text className='class-bar-name'>{c.name}</Text>
                <View className='class-bar-track'>
                  <View className='class-bar-fill' style={{ width: `${Math.min(c.amount / (monthAmount || 1) * 100, 100)}%` }} />
                </View>
                <Text className='class-bar-val'>¥{c.amount.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        )}

        <View className='dashboard-section'>
          <Text className='section-title'>⚡ 快捷入口</Text>
          <View className='quick-entry-grid'>
            <View className='quick-entry-item' onClick={() => setViewMode('overview')}>
              <Text className='entry-icon'>📊</Text>
              <Text className='entry-label'>财务概览</Text>
            </View>
            <View className='quick-entry-item' onClick={() => setViewMode('add')}>
              <Text className='entry-icon'>➕</Text>
              <Text className='entry-label'>收费录入</Text>
            </View>
            <View className='quick-entry-item' onClick={() => { Taro.navigateTo({ url: '/pages/kitchen/index' }) }}>
              <Text className='entry-icon'>📋</Text>
              <Text className='entry-label'>本周食谱</Text>
            </View>
          </View>
        </View>

        <View className='logout-section' onClick={handleLogout}>
          <Text className='logout-icon'>🚪</Text>
          <Text className='logout-text'>退出登录</Text>
        </View>

        <View style={{ height: '120rpx' }} />
      </ScrollView>
    )
  }

  // ========== 收费概览 ==========
  const renderOverview = () => (
    <ScrollView className='dashboard-scroll' scrollY>
      <View className='sub-header'>
        <View className='back-btn' onClick={() => setViewMode('dashboard')}><Text>← 工作台</Text></View>
        <Text className='sub-title'>📊 收费概览</Text>
      </View>

      <View className='filter-bar'>
        <Picker mode='date' fields='month' value={filterMonth} onChange={(e) => setFilterMonth(e.detail.value)}>
          <View className='filter-item'><Text className='label'>📅 {filterMonth}</Text></View>
        </Picker>
        <Picker mode='selector' range={CLASSES} onChange={(e) => setFilterClass(CLASSES[Number(e.detail.value)])}>
          <View className='filter-item'><Text className='label'>🏫 {filterClass}</Text></View>
        </Picker>
      </View>

      <View className='total-card'>
        <Text className='label'>本月收费总额</Text>
        <Text className='amount'>¥{monthAmount.toLocaleString()}</Text>
        <Text className='count'>{monthPayments.length}笔交易</Text>
      </View>

      <View className='method-cards'>
        {['wechat', 'alipay', 'cash', 'transfer'].map(m => (
          <View key={m} className={`method-card ${m}`}>
            <Text className='icon'>{getMethodIcon(m)}</Text>
            <Text className='label'>{getMethodLabel(m)}</Text>
            <Text className='amount'>¥{monthPayments.filter(p => p.paymentMethod === m).reduce((s, p) => s + p.amount, 0).toLocaleString()}</Text>
          </View>
        ))}
      </View>

      {classDistribution.length > 0 && (
        <View className='dashboard-section'>
          <Text className='section-title'>班级收费明细</Text>
          {classDistribution.map(c => (
            <View key={c.name} className='class-bar-row'>
              <Text className='class-bar-name'>{c.name}</Text>
              <Text className='class-bar-val'>¥{c.amount.toLocaleString()}（{c.count}笔）</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: '120rpx' }} />
    </ScrollView>
  )

  // ========== 缴费记录列表 ==========
  const renderList = () => (
    <ScrollView className='dashboard-scroll' scrollY>
      <View className='sub-header'>
        <View className='back-btn' onClick={() => setViewMode('dashboard')}><Text>← 工作台</Text></View>
        <Text className='sub-title'>🧾 缴费记录</Text>
      </View>

      <View className='filter-bar'>
        <Picker mode='date' fields='month' value={filterMonth} onChange={(e) => setFilterMonth(e.detail.value)}>
          <View className='filter-item'><Text className='label'>📅 {filterMonth}</Text></View>
        </Picker>
        <Picker mode='selector' range={CLASSES} onChange={(e) => setFilterClass(CLASSES[Number(e.detail.value)])}>
          <View className='filter-item'><Text className='label'>🏫 {filterClass}</Text></View>
        </Picker>
      </View>

      {monthPayments.map(p => (
        <View key={p.id} className='payment-card'>
          <View className='card-header'>
            <View className='student'>
              <Text className='name'>{p.studentName}</Text>
              <Text className='class'>{p.studentClass}</Text>
            </View>
            <Text className={`amount ${p.amount < 0 ? 'refund' : ''}`}>{p.amount < 0 ? '-' : ''}¥{Math.abs(p.amount).toLocaleString()}</Text>
          </View>
          <View className='card-body'>
            <View className='info-row'>
              <Text className='label'>支付方式</Text>
              <Text className='value'>{getMethodIcon(p.paymentMethod)} {getMethodLabel(p.paymentMethod)}</Text>
            </View>
            <View className='info-row'>
              <Text className='label'>缴费项目</Text>
              <Text className='value'>{p.feeDetails?.map(f => f.label).join('、') || p.feeType}</Text>
            </View>
            <View className='info-row'>
              <Text className='label'>缴费时间</Text>
              <Text className='value'>{new Date(p.paymentDate).toLocaleString()}</Text>
            </View>
            {p.notes && <View className='info-row'><Text className='label'>备注</Text><Text className='value'>{p.notes}</Text></View>}
          </View>
          <View className='card-footer'>
            <View className='action-btn refund-btn' onClick={() => handleRefund(p)}><Text>🔄 退款</Text></View>
            <View className='action-btn delete-btn' onClick={() => deletePayment(p.id)}><Text>🗑️ 删除</Text></View>
          </View>
        </View>
      ))}
      {monthPayments.length === 0 && <View className='empty-large'><Text className='icon'>📭</Text><Text className='text'>暂无缴费记录</Text></View>}

      <View style={{ height: '120rpx' }} />
    </ScrollView>
  )

  // ========== 欠费/待跟进 ==========
  const renderArrears = () => (
    <ScrollView className='dashboard-scroll' scrollY>
      <View className='sub-header'>
        <View className='back-btn' onClick={() => setViewMode('dashboard')}><Text>← 工作台</Text></View>
        <Text className='sub-title'>⚠️ 欠费/待跟进</Text>
      </View>

      {arrearsStudents.map(p => (
        <View key={p.id} className='arrears-card'>
          <View className='arrears-top'>
            <Text className='arr-name-big'>{p.studentName}</Text>
            <Text className='arr-class-big'>{p.studentClass}</Text>
          </View>
          <Text className='arr-amount-big'>¥{p.amount.toLocaleString()}</Text>
          {p.notes && <Text className='arr-notes'>备注：{p.notes}</Text>}
        </View>
      ))}
      {arrearsStudents.length === 0 && <View className='empty-large'><Text className='icon'>✅</Text><Text className='text'>暂无欠费记录</Text></View>}

      <View style={{ height: '120rpx' }} />
    </ScrollView>
  )

  // ========== 收费录入 ==========
  const renderAdd = () => (
    <ScrollView className='dashboard-scroll' scrollY>
      <View className='sub-header'>
        <View className='back-btn' onClick={() => setViewMode('dashboard')}><Text>← 工作台</Text></View>
        <Text className='sub-title'>➕ 收费录入</Text>
      </View>

      <View className='add-form'>
        <View className='form-group'>
          <Text className='group-title'>学生信息</Text>
          <View className='form-item'>
            <Text className='label'>学生姓名</Text>
            <Input className='input' placeholder='请输入学生姓名' value={addForm.studentName} onInput={e => setAddForm(prev => ({ ...prev, studentName: e.detail.value }))} />
          </View>
          <View className='form-item'>
            <Text className='label'>班级</Text>
            <Picker mode='selector' range={CLASSES.slice(1)} onChange={e => setAddForm(prev => ({ ...prev, studentClass: CLASSES.slice(1)[Number(e.detail.value)] }))}>
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
            <Text className='label'>金额(元)</Text>
            <Input className='input' type='digit' placeholder='请输入金额' value={addForm.amount} onInput={e => setAddForm(prev => ({ ...prev, amount: e.detail.value }))} />
          </View>
          <View className='form-item'>
            <Text className='label'>收费项目</Text>
            <Picker mode='selector' range={FEE_TYPE_OPTIONS} onChange={e => setAddForm(prev => ({ ...prev, feeType: FEE_TYPE_OPTIONS[Number(e.detail.value)] }))}>
              <View className='picker-value'>
                <Text>{addForm.feeType}</Text>
                <Text className='picker-arrow'>▼</Text>
              </View>
            </Picker>
          </View>
          <View className='form-item'>
            <Text className='label'>支付方式</Text>
            <Picker mode='selector' range={PAYMENT_METHOD_OPTIONS} onChange={e => setAddForm(prev => ({ ...prev, paymentMethod: PAYMENT_METHOD_OPTIONS[Number(e.detail.value)] }))}>
              <View className='picker-value'>
                <Text>{addForm.paymentMethod}</Text>
                <Text className='picker-arrow'>▼</Text>
              </View>
            </Picker>
          </View>
          <View className='form-item'>
            <Text className='label'>备注</Text>
            <Input className='input' placeholder='选填' value={addForm.notes} onInput={e => setAddForm(prev => ({ ...prev, notes: e.detail.value }))} />
          </View>
        </View>

        <View className='add-actions'>
          <View className='add-btn cancel' onClick={() => setViewMode('dashboard')}><Text>取消</Text></View>
          <View className='add-btn confirm' onClick={handleAddPayment}><Text>确认录入</Text></View>
        </View>
      </View>

      <View style={{ height: '120rpx' }} />
    </ScrollView>
  )

  return (
    <View className='finance-page'>
      {viewMode === 'dashboard' && renderDashboard()}
      {viewMode === 'overview' && renderOverview()}
      {viewMode === 'list' && renderList()}
      {viewMode === 'arrears' && renderArrears()}
      {viewMode === 'add' && renderAdd()}
    </View>
  )
}
